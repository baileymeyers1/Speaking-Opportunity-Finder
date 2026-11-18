import { config } from '../config/index.js';
import type { ScraperResult } from '../scrapers/qualityScore.js';
import {
  extractOpportunity,
  mergeExtraction,
  type ExtractionInput,
  type MergedOpportunity,
} from './extraction.js';
import type { PageFetchResult } from './pageText.js';
import { isSearchSource } from './searchSources.js';

/**
 * Enrichment of a scraped row: one Claude extraction (see extraction.ts)
 * merged into the row. The page text, when the caller fetched it, gives the
 * model far more to work with than the scraped description.
 */

export type EnrichmentStatus = 'enriched' | 'failed' | 'skipped';

/** The merged row when the extraction ran; otherwise the row as it was, with why. */
export type EnrichedOpportunity =
  | (MergedOpportunity & { enrichmentStatus: 'enriched'; enrichedAt: Date })
  | (ScraperResult & { enrichmentStatus: 'failed' | 'skipped'; enrichedAt: Date; enrichmentError?: string });

export interface EnrichOptions {
  /** Visible text of `applyUrl`, when it was fetched. */
  pageText?: string | null;
  now?: Date;
}

/** Reason recorded on a search hit whose page could not be read (see `planEnrichment`). */
export const PAGE_UNREADABLE = 'page unreadable';

/**
 * Cheap pre-checks that decide whether Claude should be called at all.
 * Returns a reason string when enrichment should be skipped, else null.
 * Exported so the background worker can skip rows without spending budget.
 *
 * "Already complete" holds for a CFP listing only: a search hit's fields were
 * guessed from a snippet by regex, and its page still has to say whether it
 * is an event at all.
 */
export function shouldSkipEnrichment(result: ScraperResult, pageText?: string | null): string | null {
  const hasCompleteData =
    result.cfpDeadline &&
    result.eventDate &&
    result.industries?.length > 0 &&
    result.location &&
    result.compensationType;
  if (hasCompleteData && !isSearchSource(result.source)) return 'already complete';

  const text = `${pageText || ''}${result.description || ''}`;
  if (text.length < 30) return 'description too short';

  return null;
}

export type EnrichmentPlan =
  | { action: 'closed'; reason: string }
  | { action: 'skip'; reason: string }
  | { action: 'extract'; pageText: string | null; pageError: string | null };

/**
 * Decide what to do with a row given the outcome of fetching its apply page.
 * A page that is gone (404/410) closes the listing without spending Claude
 * budget. Other fetch failures fall back to the scraped description for a CFP
 * listing, which vouches for the call. A search hit has only its page: when
 * that cannot be read, no Claude call is made and the row stays unlisted
 * (verification retries the page and enriches the row when it can be read).
 */
export function planEnrichment(result: ScraperResult, page: PageFetchResult): EnrichmentPlan {
  if (!page.ok && page.reason === 'gone') {
    return { action: 'closed', reason: page.message };
  }
  if (!page.ok && isSearchSource(result.source)) {
    return { action: 'skip', reason: `${PAGE_UNREADABLE}: ${page.message}` };
  }
  const pageText = page.ok ? page.text : null;
  const skipReason = shouldSkipEnrichment(result, pageText);
  if (skipReason) return { action: 'skip', reason: skipReason };
  return { action: 'extract', pageText, pageError: page.ok ? null : page.message };
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
