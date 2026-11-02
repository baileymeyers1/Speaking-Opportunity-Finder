import { computeQualityScore, type ScraperResult } from './qualityScore.js';

/**
 * Builds the Prisma `data` objects used when persisting scraper results.
 *
 * The rules that matter:
 * - Enrichment bookkeeping (`enrichmentStatus`, `enrichedAt`, `enrichmentError`,
 *   `enrichmentAttempts`, `enrichmentClaimedAt`, `isClosed`, `isRelevant`) is
 *   never written from a scrape. Only the enrichment worker owns those columns.
 * - When the existing row has been enriched by Claude, a re-scrape only fills
 *   fields that are still empty. It never replaces a value Claude already set.
 * - `applyUrl` is never changed on an update, so saved links stay stable.
 */

/** The subset of an Opportunity row that persistence needs to merge against. */
export interface ExistingOpportunityRow {
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: Date | null;
  cfpDeadline: Date | null;
  format: string;
  industries: string;
  compensationType: string | null;
  compensationAmount: number | null;
  compensationDetails: string | null;
  source: string;
  sourceUrl: string | null;
  enrichmentStatus: string | null;
  isClosed: boolean;
  isRelevant: boolean;
}

export interface ScrapedUpdateData {
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: Date | null;
  cfpDeadline: Date | null;
  format: string;
  industries: string;
  compensationType: string | null;
  compensationAmount: number | null;
  compensationDetails: string | null;
  qualityScore: number;
  source: string;
  sourceUrl: string | null;
}

export interface ScrapedCreateData extends ScrapedUpdateData {
  applyUrl: string;
}

export function inferCompensation(description?: string | null): {
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
} {
  if (!description) return {};
  const lower = description.toLowerCase();
  let compensationType: string | undefined;

  if (/\bhonorarium\b/.test(lower)) compensationType = 'honorarium';
  else if (/\bpaid\b/.test(lower)) compensationType = 'paid';
  else if (/\btravel\b/.test(lower)) compensationType = 'travel';
  else if (/\bstipend\b/.test(lower)) compensationType = 'paid';
  else if (/\bexposure\b/.test(lower)) compensationType = 'exposure';

  const amountMatch = description.match(/\$[\s]*([0-9]{2,6}(?:,[0-9]{3})?)/);
  const compensationAmount = amountMatch
    ? parseInt(amountMatch[1].replace(/,/g, ''), 10)
    : undefined;

  const compensationDetails = compensationType ? description.substring(0, 300) : undefined;

  return { compensationType, compensationAmount, compensationDetails };
}

function parseIndustries(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Scraped fields with compensation inferred from the description when the scraper gave none. */
function scrapedFields(result: ScraperResult) {
  const inferred = inferCompensation(result.description);
  return {
    title: result.title,
    organization: result.organization,
    description: result.description || null,
    location: result.location || null,
    isRemote: result.isRemote,
    eventDate: result.eventDate || null,
    cfpDeadline: result.cfpDeadline || null,
    format: result.format,
    industries: result.industries || [],
    compensationType: result.compensationType || inferred.compensationType || null,
    compensationAmount: result.compensationAmount || inferred.compensationAmount || null,
    compensationDetails: result.compensationDetails || inferred.compensationDetails || null,
    source: result.source,
    sourceUrl: result.sourceUrl || null,
  };
}

export function buildCreateData(result: ScraperResult): ScrapedCreateData {
  const scraped = scrapedFields(result);
  return {
    ...scraped,
    industries: JSON.stringify(scraped.industries),
    applyUrl: result.applyUrl,
    qualityScore: result.qualityScore ?? computeQualityScore(result),
  };
}

/**
 * Merge a fresh scrape into an existing row. See the module comment for the rules.
 */
export function buildUpdateData(
  result: ScraperResult,
  existing: ExistingOpportunityRow
): ScrapedUpdateData {
  const scraped = scrapedFields(result);
  const preserveEnriched = existing.enrichmentStatus === 'enriched';

  const pick = <T>(existingValue: T | null, scrapedValue: T | null): T | null =>
    preserveEnriched && existingValue !== null && existingValue !== undefined
      ? existingValue
      : scrapedValue;

  const existingIndustries = parseIndustries(existing.industries);
  const industries =
    preserveEnriched && existingIndustries.length > 0 ? existingIndustries : scraped.industries;

  const merged = {
    title: pick(existing.title, scraped.title) as string,
    organization: pick(existing.organization, scraped.organization) as string,
    // The description is raw source text; enrichment never rewrites it.
    description: scraped.description ?? existing.description,
    location: pick(existing.location, scraped.location),
    isRemote: preserveEnriched ? existing.isRemote : scraped.isRemote,
    eventDate: pick(existing.eventDate, scraped.eventDate),
    cfpDeadline: pick(existing.cfpDeadline, scraped.cfpDeadline),
    format: scraped.format,
    industries,
    compensationType: pick(existing.compensationType, scraped.compensationType),
    compensationAmount: pick(existing.compensationAmount, scraped.compensationAmount),
    compensationDetails: pick(existing.compensationDetails, scraped.compensationDetails),
    source: scraped.source,
    sourceUrl: scraped.sourceUrl ?? existing.sourceUrl,
  };

  const qualityScore = computeQualityScore({
    ...merged,
    description: merged.description ?? undefined,
    eventDate: merged.eventDate ?? undefined,
    cfpDeadline: merged.cfpDeadline ?? undefined,
    compensationType: merged.compensationType ?? undefined,
    compensationAmount: merged.compensationAmount ?? undefined,
    compensationDetails: merged.compensationDetails ?? undefined,
    applyUrl: '',
    isClosed: existing.isClosed,
    isRelevant: existing.isRelevant,
  });

  return {
    ...merged,
    industries: JSON.stringify(industries),
    qualityScore,
  };
}
