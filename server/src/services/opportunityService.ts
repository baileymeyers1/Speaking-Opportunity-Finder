import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { parseDateConfidence } from './extraction.js';
import { assignEvents } from './eventAssignment.js';
import { attachEventContext, shadowedEditionIds } from './eventContext.js';
import { MATCH_SORT_CANDIDATE_CAP, scoreOpportunities, type MatchProfile } from './matchScore.js';
import {
  buildOpportunityOrderBy,
  buildOpportunityWhere,
  computeSearchRelevance,
  type OpportunityFilters,
} from './opportunityQuery.js';
import type { CompensationType, OpportunityFormat, OpportunityWithDates, PaginatedResponse } from 'shared';

export type { OpportunityFilters } from './opportunityQuery.js';

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface ListOptions {
  /** The signed-in user's speaker profile; when set, every row gets a match score. */
  profile?: MatchProfile | null;
  now?: Date;
}

function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function transformOpportunity(opp: {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: Date | null;
  cfpDeadline: Date | null;
  deadlineTimezone?: string | null;
  format: string;
  industries: string;
  compensationType: string | null;
  compensationAmount: number | null;
  compensationDetails: string | null;
  applyUrl: string;
  qualityScore: number | null;
  source: string;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  dateConfidence?: string | null;
  verifiedAt?: Date | null;
  verificationError?: string | null;
  eventId?: string | null;
  editionYear?: number | null;
  alsoListedOn?: string[];
  previousEditions?: OpportunityWithDates['previousEditions'];
  eventEditions?: OpportunityWithDates['eventEditions'];
}): OpportunityWithDates {
  // The database stores these as plain strings; the wire type narrows them.
  return {
    ...opp,
    format: opp.format as OpportunityFormat,
    compensationType: opp.compensationType as CompensationType | null,
    industries: parseJsonArray(opp.industries),
    dateConfidence: parseDateConfidence(opp.dateConfidence),
  };
}

/**
 * The visibility `where` plus grouping by event: of an event's visible rows
 * only the one with the nearest open deadline is listed, the rest are hidden
 * by id (`eventContext.shadowedEditionIds`). Rows without an event are listed
 * as they are. The hidden set is small (the duplicates), so `notIn` stays cheap.
 */
async function buildGroupedWhere(filters: OpportunityFilters, now: Date | undefined) {
  const where = buildOpportunityWhere(filters, now);
  const shadowed = await shadowedEditionIds(now);
  if (shadowed.length > 0) where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { id: { notIn: shadowed } }];
  return where;
}

/** Adds `matchScore` / reasons / misses when there is a profile to score against. */
export function withMatchScores(
  items: OpportunityWithDates[],
  options: ListOptions,
  sort = false
): OpportunityWithDates[] {
  if (!options.profile) return items;
  return scoreOpportunities(options.profile, items, options.now, { sort });
}

function paginate<T>(items: T[], page: number, pageSize: number, total: number): PaginatedResponse<T> {
  const skip = (page - 1) * pageSize;
  return {
    items: items.slice(skip, skip + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getOpportunities(
  filters: OpportunityFilters = {},
  pagination: PaginationParams = {},
  options: ListOptions = {}
): Promise<PaginatedResponse<OpportunityWithDates>> {
  const { page = 1, pageSize = 20 } = pagination;
  const where = await buildGroupedWhere(filters, options.now);
  const orderBy = buildOpportunityOrderBy(filters.sortBy);
  const sortByMatch = filters.sortBy === 'match' && Boolean(options.profile);

  // A search term is ranked by keyword relevance across every match before
  // paginating; a page-sized DB slice would only re-sort within itself.
  if (filters.search) {
    const [allMatches, total] = await Promise.all([
      prisma.opportunity.findMany({ where, orderBy }),
      prisma.opportunity.count({ where }),
    ]);
    const search = filters.search;
    const ranked = allMatches
      .map((item) => ({ item, relevance: computeSearchRelevance(item, search) }))
      .sort((a, b) => b.relevance - a.relevance)
      .map((entry) => transformOpportunity(entry.item));
    const result = paginate(withMatchScores(ranked, options, sortByMatch), page, pageSize, total);
    return { ...result, items: await attachEventContext(result.items) };
  }

  // Best match has no column to order by: score a capped candidate set in memory.
  if (sortByMatch) {
    const [candidates, count] = await Promise.all([
      prisma.opportunity.findMany({ where, orderBy, take: MATCH_SORT_CANDIDATE_CAP }),
      prisma.opportunity.count({ where }),
    ]);
    const ranked = withMatchScores(candidates.map(transformOpportunity), options, true);
    const result = paginate(ranked, page, pageSize, Math.min(count, MATCH_SORT_CANDIDATE_CAP));
    return { ...result, items: await attachEventContext(result.items) };
  }

  const [items, total] = await Promise.all([
    prisma.opportunity.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy }),
    prisma.opportunity.count({ where }),
  ]);

  return {
    items: await attachEventContext(withMatchScores(items.map(transformOpportunity), options)),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** One row with its event context (other sources, earlier years, every edition of its event). */
export async function getOpportunityById(id: string, options: ListOptions = {}) {
  const opportunity = await prisma.opportunity.findUnique({ where: { id } });

  if (!opportunity) {
    throw new AppError(404, 'Opportunity not found');
  }

  const [item] = await attachEventContext(withMatchScores([transformOpportunity(opportunity)], options));
  return item;
}

export interface OpportunityCreateInput {
  title: string;
  organization: string;
  description?: string;
  location?: string;
  isRemote?: boolean;
  eventDate?: Date;
  cfpDeadline?: Date;
  deadlineTimezone?: string;
  format: string;
  industries?: string[];
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
  applyUrl: string;
  qualityScore?: number;
  source: string;
  sourceUrl?: string;
}

export async function createOpportunity(data: OpportunityCreateInput) {
  const opportunity = await prisma.opportunity.create({
    data: {
      ...data,
      industries: JSON.stringify(data.industries || []),
    },
  });
  const [assigned] = await assignEvents(prisma, [opportunity]);
  return transformOpportunity({ ...opportunity, eventId: assigned?.eventId ?? null, editionYear: assigned?.editionYear ?? null });
}

export async function findByApplyUrl(applyUrl: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { applyUrl },
  });
  if (!opportunity) return null;
  return transformOpportunity(opportunity);
}

// Get unique locations for filter dropdown
export async function getUniqueLocations(): Promise<string[]> {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      location: { not: null },
    },
    select: { location: true },
    distinct: ['location'],
  });

  return opportunities
    .map((o) => o.location)
    .filter((l): l is string => l !== null)
    .sort();
}

// Get unique industries for filter dropdown
export async function getUniqueIndustries(): Promise<string[]> {
  const opportunities = await prisma.opportunity.findMany({
    select: { industries: true },
  });

  const allIndustries = new Set<string>();
  for (const opp of opportunities) {
    const industries = parseJsonArray(opp.industries);
    industries.forEach((i) => allIndustries.add(i));
  }

  return Array.from(allIndustries).sort();
}

// Get compensation range for slider bounds
export async function getCompensationRange(): Promise<{ min: number; max: number }> {
  const result = await prisma.opportunity.aggregate({
    _min: { compensationAmount: true },
    _max: { compensationAmount: true },
  });

  return {
    min: result._min.compensationAmount || 0,
    max: result._max.compensationAmount || 5000,
  };
}

export async function getCompensationStats(): Promise<{ hasCompensation: boolean }> {
  const count = await prisma.opportunity.count({
    where: {
      OR: [
        { compensationType: { not: null } },
        { compensationAmount: { not: null } },
      ],
    },
  });

  return { hasCompensation: count > 0 };
}
