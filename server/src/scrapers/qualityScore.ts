/**
 * Shared scraper output shape and the heuristic quality score.
 * Lives apart from the orchestrator so persistence and enrichment can
 * import it without pulling in every scraper.
 */
export interface ScraperResult {
  title: string;
  organization: string;
  description?: string;
  location?: string | null;
  isRemote: boolean;
  eventDate?: Date;
  /** The instant the call closes (see lib/deadlines.ts); scrapers build it from the stated day. */
  cfpDeadline?: Date;
  /** IANA zone or `AoE` the deadline was stated in; null/undefined when unknown (read as AoE). */
  deadlineTimezone?: string | null;
  format: string;
  industries: string[];
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
  applyUrl: string;
  qualityScore?: number;
  source: string;
  sourceUrl?: string | null;
  /** Set by enrichment: the call for speakers is closed. Forces score 0. */
  isClosed?: boolean;
  /** Set by enrichment: false when the page is not a speaking opportunity. Forces score 0. */
  isRelevant?: boolean;
  /** Set by extraction: the page asks for speakers now. Undefined when not judged. */
  hasOpenCall?: boolean;
}

export const TRUSTED_SOURCES = [
  'papercall.io',
  'confs.tech',
  'javaconferences.org',
  'callingallpapers.com',
  'wikicfp.com',
  // First-party CFP platforms: the listing is the submission form itself.
  'pretalx.com',
  'sessionize.com',
];

export function computeQualityScore(result: ScraperResult): number {
  // Closed or irrelevant listings never surface, regardless of metadata.
  if (result.isClosed === true || result.isRelevant === false) return 0;

  let score = 5; // Low base — must earn points

  // Critical fields (55 points)
  if (result.cfpDeadline) score += 25;
  if (result.eventDate) score += 15;
  if (result.location) score += 10;
  if (result.compensationType || result.compensationAmount) score += 5;

  // Industries (10 points, scaled)
  const validIndustries = (result.industries || []).filter(
    (i) => !['events', 'cross-industry', 'general'].includes(i.toLowerCase())
  );
  score += Math.min(10, validIndustries.length * 5);

  // Description quality (20 points)
  const desc = result.description || '';
  if (desc.length > 200) {
    const isPlaceholder =
      /^submit your talk/i.test(desc) ||
      /^call for (speakers|papers)/i.test(desc) ||
      /^we invite you/i.test(desc);
    score += isPlaceholder ? 3 : 20;
  } else if (desc.length > 80) {
    score += 8;
  }

  // Source trust (10 points)
  if (TRUSTED_SOURCES.includes(result.source)) score += 10;

  return Math.min(100, Math.max(0, score));
}
