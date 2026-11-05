import { Prisma } from '../generated/prisma/client.js';
import type { SortBy } from 'shared';
import { matchesAllTerms, searchTerms, termAlternatives, termMatches } from './searchTerms.js';

/** Filters accepted by `getOpportunities`, as the controller builds them from the query string. */
export interface OpportunityFilters {
  search?: string;
  format?: string[];
  industries?: string[];
  isRemote?: boolean;
  location?: string;
  compensationType?: string[];
  compensationMin?: number;
  compensationMax?: number;
  cfpDeadlineBefore?: Date;
  cfpDeadlineAfter?: Date;
  sortBy?: SortBy;
  qualityMin?: number;
}

/** Rows with almost no metadata (base score 5) never surface. */
const MIN_QUALITY_SCORE = 15;

/** Source of rows stored from a live search (see liveSearchService). */
export const LIVE_SEARCH_SOURCE = 'Live Search';

/**
 * A live-search hit is stored with only what the search snippet said; it is
 * listed once its page has been read (enriched). Hits not read yet, and hits
 * whose read failed or was skipped, would be empty cards, so they stay hidden.
 */
export const UNREAD_LIVE_HIT: Prisma.OpportunityWhereInput = {
  source: LIVE_SEARCH_SOURCE,
  OR: [{ enrichmentStatus: null }, { enrichmentStatus: { not: 'enriched' } }],
};

/** Case-insensitive `contains` (Postgres `ILIKE`). */
export function containsInsensitive(value: string): Prisma.StringFilter {
  return { contains: value, mode: 'insensitive' };
}

/**
 * The Prisma `where` for a filter set: future or missing deadline, visible,
 * plus every active filter. A search term narrows by ILIKE on each word; the
 * caller applies the whole-word rule with `matchesSearch` afterwards.
 */
export function buildOpportunityWhere(filters: OpportunityFilters, now: Date = new Date()): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = {
    OR: [{ cfpDeadline: { gte: now } }, { cfpDeadline: null }],
    qualityScore: { gte: MIN_QUALITY_SCORE },
    // Enrichment flags: closed CFPs and non-speaking pages never surface
    isClosed: false,
    isRelevant: true,
  };
  const andConditions: Prisma.OpportunityWhereInput[] = [{ NOT: UNREAD_LIVE_HIT }];

  // Text search: every word must appear in one of the fields.
  if (filters.search) {
    const terms = searchTerms(filters.search);
    for (const term of terms.length > 0 ? terms : [filters.search.trim()]) {
      andConditions.push({
        OR: termAlternatives(term).flatMap((form) => [
          { title: containsInsensitive(form) },
          { organization: containsInsensitive(form) },
          { description: containsInsensitive(form) },
          { industries: containsInsensitive(form) },
        ]),
      });
    }
  }

  if (filters.format && filters.format.length > 0) {
    where.format = { in: filters.format };
  }

  // Industry filter (OR logic - match ANY selected industry). `industries` is a
  // JSON-encoded array; match the quoted token so "ai" does not match "retail".
  if (filters.industries && filters.industries.length > 0) {
    andConditions.push({
      OR: filters.industries.map((industry) => ({ industries: containsInsensitive(`"${industry}"`) })),
    });
  }

  if (filters.isRemote !== undefined) {
    where.isRemote = filters.isRemote;
  }

  // Location filter (supports multiple pipe-separated locations, fuzzy contains)
  if (filters.location) {
    const locations = filters.location.split('|').map((l) => l.trim()).filter(Boolean);
    if (locations.length === 1) {
      andConditions.push({ location: containsInsensitive(locations[0]) });
    } else if (locations.length > 1) {
      andConditions.push({ OR: locations.map((loc) => ({ location: containsInsensitive(loc) })) });
    }
  }

  if (filters.compensationType && filters.compensationType.length > 0) {
    where.compensationType = { in: filters.compensationType };
  }

  if (filters.compensationMin !== undefined || filters.compensationMax !== undefined) {
    where.compensationAmount = {};
    if (filters.compensationMin !== undefined) where.compensationAmount.gte = filters.compensationMin;
    if (filters.compensationMax !== undefined) where.compensationAmount.lte = filters.compensationMax;
  }

  if (filters.qualityMin !== undefined) {
    where.qualityScore = { gte: Math.max(filters.qualityMin, MIN_QUALITY_SCORE) };
  }

  if (filters.cfpDeadlineBefore || filters.cfpDeadlineAfter) {
    where.cfpDeadline = {};
    if (filters.cfpDeadlineBefore) where.cfpDeadline.lte = filters.cfpDeadlineBefore;
    if (filters.cfpDeadlineAfter) where.cfpDeadline.gte = filters.cfpDeadlineAfter;
  }

  where.AND = andConditions;
  return where;
}

/**
 * Database ordering for a sort. `match` has no column to order by: the
 * candidate set comes out quality-first and is sorted in memory afterwards.
 */
export function buildOpportunityOrderBy(sortBy: SortBy | undefined): Prisma.OpportunityOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'quality':
    case 'match':
      return [{ qualityScore: Prisma.SortOrder.desc }, { cfpDeadline: Prisma.SortOrder.asc }];
    case 'eventDate':
      return [{ eventDate: Prisma.SortOrder.asc }, { cfpDeadline: Prisma.SortOrder.asc }];
    default:
      return [{ cfpDeadline: Prisma.SortOrder.asc }];
  }
}

interface RelevanceInput {
  title?: string | null;
  organization?: string | null;
  industries?: string | null;
  description?: string | null;
  qualityScore?: number | null;
}

function parseIndustries(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Whether a row matches a search query under the whole-word rule of
 * `searchTerms.ts`: every word in the title, organization, industries or
 * description. ILIKE in the `where` is only a coarse first pass.
 */
export function matchesSearch(opportunity: RelevanceInput, query: string): boolean {
  const industries = parseIndustries(opportunity.industries).join(' ');
  return matchesAllTerms(searchTerms(query), [opportunity.title, opportunity.organization, industries, opportunity.description]);
}

/** Keyword relevance of a row to a search term; higher is better. */
export function computeSearchRelevance(opportunity: RelevanceInput, query: string): number {
  const q = query.toLowerCase();
  let score = 0;

  // Title match is strongest signal
  const title = (opportunity.title || '').toLowerCase();
  if (title === q) score += 100;
  else if (title.startsWith(q)) score += 80;
  else if (title.includes(q)) score += 50;

  const org = (opportunity.organization || '').toLowerCase();
  if (org.includes(q)) score += 30;

  try {
    const industries: unknown = JSON.parse(opportunity.industries || '[]');
    if (Array.isArray(industries) && industries.some((ind) => String(ind).toLowerCase().includes(q))) score += 40;
  } catch {
    // Malformed JSON contributes nothing to the score.
  }

  // Description match (weakest: any tech conf could mention "entertainment" in passing)
  const desc = (opportunity.description || '').toLowerCase();
  if (desc.includes(q)) score += 10;

  // Each word of a multi-word query counts on its own, so "AI for PR" ranks
  // "AI in PR: a summit" above a page that only mentions both in passing.
  const terms = searchTerms(query);
  if (terms.length > 1) {
    const industries = parseIndustries(opportunity.industries).join(' ');
    for (const term of terms) {
      if (termMatches(term, opportunity.title)) score += 20;
      if (termMatches(term, opportunity.organization)) score += 10;
      if (termMatches(term, industries)) score += 15;
      if (termMatches(term, opportunity.description)) score += 5;
    }
  }

  score += (opportunity.qualityScore || 0) * 0.1;
  return score;
}
