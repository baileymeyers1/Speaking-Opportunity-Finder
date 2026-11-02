import { config } from '../config/index.js';
import type { ScraperResult } from '../scrapers/qualityScore.js';
import {
  extractOpportunity,
  mergeExtraction,
  type DateConfidence,
  type ExtractionInput,
} from './extraction.js';

/**
 * Enrichment of a scraped row: one Claude extraction (see extraction.ts)
 * merged into the row. The page text, when the caller fetched it, gives the
 * model far more to work with than the scraped description.
 */

export type EnrichmentStatus = 'enriched' | 'failed' | 'skipped';

export interface EnrichedOpportunity extends ScraperResult {
  enrichmentStatus: EnrichmentStatus;
  enrichedAt: Date;
  enrichmentError?: string;
  isClosed?: boolean;
  isRelevant?: boolean;
  dateConfidence?: DateConfidence;
}

export interface EnrichOptions {
  /** Visible text of `applyUrl`, when it was fetched. */
  pageText?: string | null;
  now?: Date;
}

/**
 * Cheap pre-checks that decide whether Claude should be called at all.
 * Returns a reason string when enrichment should be skipped, else null.
 * Exported so the background worker can skip rows without spending budget.
 */
export function shouldSkipEnrichment(result: ScraperResult, pageText?: string | null): string | null {
  const hasCompleteData =
    result.cfpDeadline &&
    result.eventDate &&
    result.industries?.length > 0 &&
    result.location &&
    result.compensationType;
  if (hasCompleteData) return 'already complete';

  const text = `${pageText || ''}${result.description || ''}`;
  if (text.length < 30) return 'description too short';

  return null;
}

export function toExtractionInput(result: ScraperResult, pageText?: string | null): ExtractionInput {
  return {
    title: result.title,
    organization: result.organization,
    description: result.description,
    pageText,
    applyUrl: result.applyUrl,
  };
}

/**
 * Enrich a single opportunity with one Claude extraction call.
 */
export async function enrichOpportunity(
  result: ScraperResult,
  options: EnrichOptions = {}
): Promise<EnrichedOpportunity> {
  const now = options.now ?? new Date();

  if (!config.claude.apiKey) {
    console.warn('ANTHROPIC_API_KEY not configured, enrichment will be skipped');
    return { ...result, enrichmentStatus: 'skipped', enrichedAt: now };
  }

  const skipReason = shouldSkipEnrichment(result, options.pageText);
  if (skipReason) {
    return { ...result, enrichmentStatus: 'skipped', enrichedAt: now, enrichmentError: skipReason };
  }

  const outcome = await extractOpportunity(toExtractionInput(result, options.pageText), { now });

  if (outcome.status === 'skipped') {
    return { ...result, enrichmentStatus: 'skipped', enrichedAt: now, enrichmentError: outcome.reason };
  }
  if (outcome.status === 'failed') {
    console.error('Enrichment failed:', outcome.error);
    return { ...result, enrichmentStatus: 'failed', enrichedAt: now, enrichmentError: outcome.error };
  }

  const merged = mergeExtraction(result, outcome.result, now);
  return { ...merged, enrichmentStatus: 'enriched', enrichedAt: now };
}

/**
 * Enrich multiple opportunities in batches.
 */
export async function enrichOpportunitiesBatch(
  results: ScraperResult[],
  batchSize: number = 5
): Promise<EnrichedOpportunity[]> {
  const enriched: EnrichedOpportunity[] = [];

  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    enriched.push(...(await Promise.all(batch.map((result) => enrichOpportunity(result)))));

    // Rate limiting: wait 1 second between batches
    if (i + batchSize < results.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return enriched;
}
