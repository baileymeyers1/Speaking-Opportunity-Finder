import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import type { ScraperResult } from '../scrapers/index.js';

export interface EnrichmentResult {
  cfpDeadline?: Date;
  eventDate?: Date;
  industries?: string[];
  location?: string;
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
  isRemote?: boolean;
  timezone?: string;
  cleanTitle?: string;
  cleanOrganization?: string;
  isRelevant?: boolean;
  isClosed?: boolean;
  enrichmentStatus: 'enriched' | 'failed' | 'skipped';
  enrichmentError?: string;
}

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!config.claude.apiKey) {
    console.warn('ANTHROPIC_API_KEY not configured, enrichment will be skipped');
    return null;
  }

  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: config.claude.apiKey,
      timeout: 30_000,
      maxRetries: 1,
    });
  }

  return anthropic;
}

/**
 * Cheap pre-checks that decide whether Claude should be called at all.
 * Returns a reason string when enrichment should be skipped, else null.
 * Exported so the background worker can skip rows without spending budget.
 */
export function shouldSkipEnrichment(result: ScraperResult): string | null {
  const hasCompleteData =
    result.cfpDeadline &&
    result.eventDate &&
    result.industries?.length > 0 &&
    result.location &&
    result.compensationType;
  if (hasCompleteData) return 'already complete';

  if ((result.description || '').length < 30) return 'description too short';

  return null;
}

/**
 * Enrich a single opportunity using Claude API
 */
export async function enrichOpportunity(
  result: ScraperResult
): Promise<ScraperResult & { enrichmentStatus?: string; enrichedAt?: Date; enrichmentError?: string; cleanTitle?: string; cleanOrganization?: string; isRelevant?: boolean; isClosed?: boolean }> {
  const client = getAnthropicClient();

  if (!client) {
    return {
      ...result,
      enrichmentStatus: 'skipped',
      enrichedAt: new Date()
    };
  }

  const skipReason = shouldSkipEnrichment(result);
  if (skipReason) {
    return {
      ...result,
      enrichmentStatus: 'skipped',
      enrichedAt: new Date(),
      enrichmentError: skipReason,
    };
  }

  try {
    const prompt = buildEnrichmentPrompt(result);

    const message = await client.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      // Extraction is simple; keep reasoning spend minimal.
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    if (message.stop_reason === 'max_tokens') {
      return {
        ...result,
        enrichmentStatus: 'failed',
        enrichedAt: new Date(),
        enrichmentError: `Response truncated at ${config.claude.maxTokens} tokens`,
      };
    }

    // Models with thinking enabled may return a thinking block first.
    const textBlock = message.content.find((block) => block.type === 'text');
    const responseText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const enriched = parseEnrichmentResponse(responseText);

    // If parsing failed, return failed status
    if (enriched.enrichmentStatus === 'failed') {
      return {
        ...result,
        enrichmentStatus: 'failed',
        enrichedAt: new Date(),
        enrichmentError: enriched.enrichmentError
      };
    }

    return {
      ...result,
      cfpDeadline: enriched.cfpDeadline || result.cfpDeadline,
      eventDate: enriched.eventDate || result.eventDate,
      industries: enriched.industries && enriched.industries.length > 0
        ? enriched.industries
        : result.industries,
      location: enriched.location || result.location,
      compensationType: enriched.compensationType || result.compensationType,
      compensationAmount: enriched.compensationAmount || result.compensationAmount,
      compensationDetails: enriched.compensationDetails || result.compensationDetails,
      isRemote: enriched.isRemote !== undefined ? enriched.isRemote : result.isRemote,
      cleanTitle: enriched.cleanTitle,
      cleanOrganization: enriched.cleanOrganization,
      isRelevant: enriched.isRelevant,
      isClosed: enriched.isClosed,
      enrichmentStatus: 'enriched',
      enrichedAt: new Date()
    };
  } catch (error) {
    console.error('Enrichment failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      ...result,
      enrichmentStatus: 'failed',
      enrichedAt: new Date(),
      enrichmentError: errorMessage
    };
  }
}

/**
 * Enrich multiple opportunities in batches
 */
export async function enrichOpportunitiesBatch(
  results: ScraperResult[],
  batchSize: number = 5
): Promise<ScraperResult[]> {
  const enriched: ScraperResult[] = [];

  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    const enrichedBatch = await Promise.all(
      batch.map(result => enrichOpportunity(result))
    );
    enriched.push(...enrichedBatch);

    // Rate limiting: wait 1 second between batches
    if (i + batchSize < results.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return enriched;
}

export function buildEnrichmentPrompt(result: ScraperResult, now: Date = new Date()): string {
  const todayStr = now.toISOString().split('T')[0];
  const thisYear = now.getUTCFullYear();
  const nextYear = thisYear + 1;
  const missing: string[] = [];
  if (!result.cfpDeadline) missing.push('cfpDeadline');
  if (!result.eventDate) missing.push('eventDate');
  if (!result.industries || result.industries.length === 0) missing.push('industries');
  if (!result.location) missing.push('location');
  if (!result.compensationType) missing.push('compensationType');

  return `Analyze this speaking opportunity listing. Return ONLY a JSON object, no other text.

Today's date is ${todayStr}. If a date has no year, assume ${thisYear} if that month has not passed yet, otherwise ${nextYear}.

Title: ${result.title}
Organization: ${result.organization}
Description: ${(result.description || '').substring(0, 1200)}

Tasks:
1. Extract any missing fields: ${missing.join(', ')}
2. Clean up the title: remove redundant suffixes like "Call for Speakers", "| Company Name" etc. Return the clean event name.
3. Extract the organizing body (company, association, or group running this event). Not the event name itself.
4. Determine if this is genuinely a speaking/presenting opportunity (true) or just a conference listing, job posting, or unrelated page (false).
5. IMPORTANT — Date distinction:
   - "cfpDeadline" = the date by which speaker proposals/abstracts must be SUBMITTED (submission deadline, proposal deadline, abstract due date). This is NOT the event date.
   - "eventDate" = the date(s) when the actual conference/event takes place. If a date range is given (e.g., "May 4-6, ${nextYear}"), use the START date.
   - Do NOT confuse these two. A "proposal deadline of September 21, ${thisYear}" for an event on "May 4-6, ${nextYear}" means cfpDeadline=${thisYear}-09-21 and eventDate=${nextYear}-05-04.
6. IMPORTANT — Closed CFP detection:
   - Set "isClosed" to true if the description indicates the call for speakers/papers/proposals is closed, expired, or no longer accepting submissions.
   - Look for phrases like "call for speakers is now closed", "submissions closed", "no longer accepting proposals", etc.
   - Also set "isClosed" to true if the submission deadline is clearly before ${todayStr}.

{"cfpDeadline":"YYYY-MM-DD or null","eventDate":"YYYY-MM-DD or null","industries":["topic1","topic2"],"location":"City, Country or Remote or null","compensationType":"paid|travel|honorarium|exposure or null","compensationAmount":null,"isRemote":false,"cleanTitle":"cleaned event name","cleanOrganization":"organizing body name","isRelevant":true,"isClosed":false}`;
}

export function parseEnrichmentResponse(responseText: string): EnrichmentResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { enrichmentStatus: 'failed', enrichmentError: 'No JSON found in response' };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Helper function to validate and parse dates
    const parseValidDate = (dateString: string | null | undefined): Date | undefined => {
      if (!dateString || dateString === 'null') return undefined;

      try {
        const date = new Date(dateString);
        // Check if date is valid and within reasonable range (1900-2100)
        if (isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) {
          console.warn(`Invalid date detected: ${dateString}, skipping`);
          return undefined;
        }
        return date;
      } catch {
        return undefined;
      }
    };

    return {
      cfpDeadline: parseValidDate(parsed.cfpDeadline),
      eventDate: parseValidDate(parsed.eventDate),
      industries: Array.isArray(parsed.industries) ? parsed.industries : undefined,
      location: parsed.location && parsed.location !== 'null' ? parsed.location : undefined,
      compensationType: parsed.compensationType && parsed.compensationType !== 'null'
        ? parsed.compensationType
        : undefined,
      compensationAmount: parsed.compensationAmount || undefined,
      compensationDetails: parsed.compensationDetails || undefined,
      isRemote: parsed.isRemote !== undefined ? parsed.isRemote : undefined,
      timezone: parsed.timezone || undefined,
      cleanTitle: parsed.cleanTitle && parsed.cleanTitle !== 'null'
        ? parsed.cleanTitle
        : undefined,
      cleanOrganization: parsed.cleanOrganization && parsed.cleanOrganization !== 'null'
        ? parsed.cleanOrganization
        : undefined,
      isRelevant: parsed.isRelevant !== undefined ? parsed.isRelevant : undefined,
      isClosed: parsed.isClosed !== undefined ? parsed.isClosed : undefined,
      enrichmentStatus: 'enriched',
    };
  } catch (error) {
    console.error('Failed to parse enrichment response:', error);
    return {
      enrichmentStatus: 'failed',
      enrichmentError: error instanceof Error ? error.message : 'Parse error'
    };
  }
}
