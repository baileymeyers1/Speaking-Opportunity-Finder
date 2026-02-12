import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import type { ScraperResult } from '../scrapers/index.js';

interface EnrichmentResult {
  cfpDeadline?: Date;
  eventDate?: Date;
  industries?: string[];
  location?: string;
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
  isRemote?: boolean;
  timezone?: string;
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
    });
  }

  return anthropic;
}

/**
 * Enrich a single opportunity using Claude API
 */
export async function enrichOpportunity(
  result: ScraperResult
): Promise<ScraperResult & { enrichmentStatus?: string }> {
  const client = getAnthropicClient();

  if (!client) {
    return { ...result, enrichmentStatus: 'skipped' };
  }

  // Skip enrichment if we already have most data
  const hasCompleteData =
    result.cfpDeadline &&
    result.eventDate &&
    result.industries?.length > 0 &&
    result.location &&
    result.compensationType;

  if (hasCompleteData) {
    return { ...result, enrichmentStatus: 'skipped' };
  }

  try {
    const prompt = buildEnrichmentPrompt(result);

    const message = await client.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const enriched = parseEnrichmentResponse(responseText);

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
      enrichmentStatus: 'enriched',
    };
  } catch (error) {
    console.error('Enrichment failed:', error);
    return {
      ...result,
      enrichmentStatus: 'failed',
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

function buildEnrichmentPrompt(result: ScraperResult): string {
  const missing: string[] = [];
  if (!result.cfpDeadline) missing.push('CFP deadline');
  if (!result.eventDate) missing.push('event date');
  if (!result.industries || result.industries.length === 0) missing.push('industries/topics');
  if (!result.location) missing.push('location');
  if (!result.compensationType) missing.push('compensation type');

  return `You are an AI assistant helping to extract structured information from speaking opportunity descriptions.

**Opportunity Title:** ${result.title}
**Organization:** ${result.organization}
**Description:** ${result.description || 'No description provided'}
**Current Location:** ${result.location || 'Not specified'}
**Current Industries:** ${result.industries?.join(', ') || 'None'}
**Current Compensation:** ${result.compensationType || 'Not specified'}

**Missing Information:** ${missing.join(', ')}

Please analyze the description and extract the following information in a structured JSON format:

{
  "cfpDeadline": "YYYY-MM-DD or null if not found",
  "eventDate": "YYYY-MM-DD or null if not found",
  "industries": ["industry1", "industry2"],
  "location": "City, State/Country or 'Remote' or 'Virtual'",
  "compensationType": "paid" | "travel" | "honorarium" | "exposure" | null,
  "compensationAmount": number in USD or null,
  "compensationDetails": "brief description",
  "isRemote": true | false,
  "timezone": "timezone if remote, e.g. 'America/New_York' or null"
}

**Instructions:**
1. Extract dates in YYYY-MM-DD format only if explicitly mentioned
2. Identify 2-5 relevant industries/topics (e.g., "technology", "AI", "JavaScript", "healthcare")
3. Normalize location to format "City, State/Country" or "Remote" or "Virtual"
4. Detect compensation type from keywords: "paid", "honorarium", "stipend", "travel covered", "exposure"
5. Extract dollar amounts if mentioned (e.g., "$500", "$1,000")
6. Determine if event is remote/virtual from keywords
7. Only return the JSON object, no other text

JSON:`;
}

function parseEnrichmentResponse(responseText: string): EnrichmentResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { enrichmentStatus: 'failed', enrichmentError: 'No JSON found in response' };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      cfpDeadline: parsed.cfpDeadline && parsed.cfpDeadline !== 'null'
        ? new Date(parsed.cfpDeadline)
        : undefined,
      eventDate: parsed.eventDate && parsed.eventDate !== 'null'
        ? new Date(parsed.eventDate)
        : undefined,
      industries: Array.isArray(parsed.industries) ? parsed.industries : undefined,
      location: parsed.location && parsed.location !== 'null' ? parsed.location : undefined,
      compensationType: parsed.compensationType && parsed.compensationType !== 'null'
        ? parsed.compensationType
        : undefined,
      compensationAmount: parsed.compensationAmount || undefined,
      compensationDetails: parsed.compensationDetails || undefined,
      isRemote: parsed.isRemote !== undefined ? parsed.isRemote : undefined,
      timezone: parsed.timezone || undefined,
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
