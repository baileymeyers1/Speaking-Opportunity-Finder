import { Prisma } from '../generated/prisma/client.js';
import type { Lane, SortBy } from 'shared';
import type { Sector } from '../lib/sectors.js';
import { SEARCH_SOURCES } from './searchSources.js';
import { matchesAllTerms, searchTerms, sectorOfTerm, sectorPhrases, termAlternatives, termMatches } from './searchTerms.js';

/** Filters accepted by `getOpportunities`, as the controller builds them from the query string. */
export interface OpportunityFilters {
  search?: string;
  format?: string[];
  /** Sector ids (lib/sectors.ts); a row matches when it carries any of them. */
  sectors?: Sector[];
  isRemote?: boolean;
  location?: string;
  compensationType?: string[];
  compensationMin?: number;
  compensationMax?: number;
  cfpDeadlineBefore?: Date;
  cfpDeadlineAfter?: Date;
  sortBy?: SortBy;
  qualityMin?: number;
  /** Which of Browse's three lists to page through (services/lanes.ts); absent lists every lane together. */
  lane?: Lane;
}

/** Rows with almost no metadata (base score 5) never surface. */
const MIN_QUALITY_SCORE = 15;

export { LIVE_SEARCH_SOURCE } from './searchSources.js';

/**
 * A search hit, live or scheduled, is stored with only what the search
 * snippet said. It is listed once its own page has been read: enriched from
 * the page (`verifiedAt` is set by a page read, never by a snippet) and
 * readable at the last check. Hits not read yet, hits whose page cannot be
 * fetched and hits whose last check failed stay hidden; they would be cards
 * nobody has checked. `isUnreadSearchHit` in searchSources is the same rule
 * for one row, and `shadowedEditionIds` in eventContext mirrors it in SQL.
 */
export const UNREAD_SEARCH_HIT: Prisma.OpportunityWhereInput = {
  source: { in: [...SEARCH_SOURCES] },
  OR: [
    { enrichmentStatus: null },
    { enrichmentStatus: { not: 'enriched' } },
    { verifiedAt: null },
    { verificationError: { not: null } },
  ],
};

/**
 * A row with no deadline is open until its event starts; after that there is
 * nothing left to apply to. Written as what stays listed, because a negated
 * comparison drops rows whose event date is null.
 */
export function deadlineOrUpcomingEvent(now: Date): Prisma.OpportunityWhereInput {
  return { OR: [{ cfpDeadline: { not: null } }, { eventDate: null }, { eventDate: { gte: now } }] };
}

/**
 * What a listed row meets beyond the closed and relevant flags and the
 * deadline: its page was read if it came from a search, and its event has not
 * already happened.
 */
export function listedConditions(now: Date = new Date()): Prisma.OpportunityWhereInput[] {
  return [{ NOT: UNREAD_SEARCH_HIT }, deadlineOrUpcomingEvent(now)];
}

/**
 * Rows no sector was found for. A row stored before the column existed holds
 * NULL, which `isEmpty` does not match, so both spellings of "none" are asked.
 */
export const WITHOUT_SECTOR: Prisma.OpportunityWhereInput = {
  OR: [{ sectors: { equals: null } }, { sectors: { isEmpty: true } }],
};

/** Case-insensitive `contains` (Postgres `ILIKE`). */
export function containsInsensitive(value: string): Prisma.StringFilter {
  return { contains: value, mode: 'insensitive' };
}

/**
 * The Prisma `where` for a filter set: future or missing deadline, visible
 * (`listedConditions`), plus every active filter. A search term narrows by ILIKE on each word; the
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
  const andConditions: Prisma.OpportunityWhereInput[] = listedConditions(now);

  // Text search: every word must appear in one of the fields.
  if (filters.search) {
    const terms = searchTerms(filters.search);
    for (const term of terms.length > 0 ? terms : [filters.search.trim()]) {
      // A word that names a sector ("energy") also takes the rows in that
      // sector, and its phrases ("oil and gas") in a title, organization or tag.
      const sector = sectorOfTerm(term);
      andConditions.push({
        OR: [
          ...termAlternatives(term).flatMap((form) => [
            { title: containsInsensitive(form) },
            { organization: containsInsensitive(form) },
            { description: containsInsensitive(form) },
            { industries: containsInsensitive(form) },
          ]),
          ...sectorPhrases(term).flatMap((phrase) => [
            { title: containsInsensitive(phrase) },
            { organization: containsInsensitive(phrase) },
            { industries: containsInsensitive(phrase) },
          ]),
          ...(sector ? [{ sectors: { has: sector } }] : []),
        ],
      });
    }
  }

  if (filters.format && filters.format.length > 0) {
    where.format = { in: filters.format };
  }

  // Sector filter: any of the selected sectors. The free-text `industries`
  // tags are searched by the text search above, never filtered on.
  if (filters.sectors && filters.sectors.length > 0) {
    andConditions.push({ sectors: { hasSome: filters.sectors } });
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
 * A call with neither a deadline nor an event date is rolling (a podcast that
 * takes guests all year). It never closes, so it is ranked as if it closed
 * this far from now: after what closes this month, before what closes later.
 */
export const ROLLING_CALL_HORIZON_DAYS = 30;

export interface ClosingSortRow {
  id: string;
  cfpDeadline: Date | null;
  eventDate: Date | null;
  qualityScore: number | null;
}

/**
 * When a call closes for sorting: its deadline; with none, the day the event
 * starts (a call cannot stay open past its event); with neither, the rolling
 * horizon. Sorting by the deadline column alone put every row without one
 * after the last dated row, so podcast calls were never seen.
 */
export function effectiveClosing(row: ClosingSortRow, now: Date = new Date()): Date {
  if (row.cfpDeadline) return row.cfpDeadline;
  if (row.eventDate) return row.eventDate;
  return new Date(now.getTime() + ROLLING_CALL_HORIZON_DAYS * 24 * 60 * 60 * 1000);
}

/** Soonest to close first; of two that close together the better row, then a stable order by id. */
export function compareByClosing(a: ClosingSortRow, b: ClosingSortRow, now: Date = new Date()): number {
  return (
    effectiveClosing(a, now).getTime() - effectiveClosing(b, now).getTime() ||
    (b.qualityScore ?? 0) - (a.qualityScore ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

/** The default sort has no single column to order by (see `effectiveClosing`): it is sorted in memory. */
export function sortsByClosing(sortBy: SortBy | undefined): boolean {
  return sortBy === undefined || sortBy === 'deadline';
}

/**
 * Database ordering for a sort. `match` has no column to order by: the
 * candidate set comes out quality-first and is sorted in memory afterwards.
 * The default (`deadline`) is ordered by `compareByClosing` instead wherever
 * a whole list is paged; the column order here is its fallback for a search,
 * which is re-ranked by relevance anyway.
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
  sectors?: readonly string[] | null;
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
 * description, or a sector word the row's sectors hold. ILIKE in the `where`
 * is only a coarse first pass.
 */
export function matchesSearch(opportunity: RelevanceInput, query: string): boolean {
  const industries = parseIndustries(opportunity.industries).join(' ');
  const headline = [opportunity.title, opportunity.organization, industries];
  return matchesAllTerms(searchTerms(query), [...headline, opportunity.description], {
    sectors: opportunity.sectors ?? [],
    headline,
  });
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

  // A row in the sector a word names counts, below a row that says the word.
  for (const term of terms) {
    const sector = sectorOfTerm(term);
    if (sector && opportunity.sectors?.includes(sector)) score += 15;
  }

  score += (opportunity.qualityScore || 0) * 0.1;
  return score;
}
