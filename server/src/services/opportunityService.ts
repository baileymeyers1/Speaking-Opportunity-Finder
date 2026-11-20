import { prisma } from '../lib/prisma.js';
import { storableDate } from '../lib/storableDate.js';
import { SECTORS, normalizeSectors } from '../lib/sectors.js';
import { sectorsFromTags } from './sectorMapping.js';
import { AppError } from '../middleware/errorHandler.js';
import { parseDateConfidence } from './extraction.js';
import { assignEvents } from './eventAssignment.js';
import { attachEventContext, shadowedEditionIds } from './eventContext.js';
import { LANE_ROW_SELECT, laneComparator, laneOf, laneWhere, summarizeLanes, type LaneRow } from './lanes.js';
import { MATCH_SORT_CANDIDATE_CAP, scoreOpportunities, type MatchProfile } from './matchScore.js';
import {
  buildOpportunityOrderBy,
  buildOpportunityWhere,
  computeSearchRelevance,
  matchesSearch,
  sortsByClosing,
  type OpportunityFilters,
} from './opportunityQuery.js';
import type { CompensationType, LaneSummary, OpportunityFormat, OpportunityWithDates, PaginatedResponse, SectorOption } from 'shared';

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
  sectors?: string[] | null;
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
    sectors: normalizeSectors(opp.sectors),
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

/**
 * The listed rows among these apply URLs, under the same visibility and
 * filters as the list (search text aside: a live search already chose them).
 * Used to show stored copies of live-search hits instead of re-reading them.
 */
export async function getListedByApplyUrls(
  applyUrls: readonly string[],
  filters: OpportunityFilters = {},
  options: ListOptions = {}
): Promise<OpportunityWithDates[]> {
  if (applyUrls.length === 0) return [];
  const where = await buildGroupedWhere({ ...filters, search: undefined }, options.now);
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { applyUrl: { in: [...applyUrls] } }];
  const rows = await prisma.opportunity.findMany({ where });
  return attachEventContext(withMatchScores(rows.map(transformOpportunity), options));
}

/**
 * Lane counts and what closes soon for a set of listed rows, with the call
 * that closes first named (one small read: the rows here carry no title).
 */
async function laneSummary(rows: readonly LaneRow[], now: Date): Promise<LaneSummary> {
  const { nextToCloseId, ...totals } = summarizeLanes(rows, now);
  const next = nextToCloseId
    ? await prisma.opportunity.findUnique({
        where: { id: nextToCloseId },
        select: { id: true, title: true, cfpDeadline: true, deadlineTimezone: true },
      })
    : null;
  return {
    ...totals,
    nextToClose: next?.cfpDeadline
      ? { id: next.id, title: next.title, cfpDeadline: next.cfpDeadline.toISOString(), deadlineTimezone: next.deadlineTimezone }
      : null,
  };
}

/**
 * One page of the list. `filters.lane` picks which of Browse's three lists is
 * paged; the summary counts all three under the other filters, so the lane
 * switch can say what is behind each choice.
 */
export async function getOpportunities(
  filters: OpportunityFilters = {},
  pagination: PaginationParams = {},
  options: ListOptions = {}
): Promise<PaginatedResponse<OpportunityWithDates>> {
  const { page = 1, pageSize = 20 } = pagination;
  const now = options.now ?? new Date();
  const { lane } = filters;
  const everyLane = await buildGroupedWhere(filters, options.now);
  const where = lane ? { AND: [everyLane, laneWhere(lane)] } : everyLane;
  const orderBy = buildOpportunityOrderBy(filters.sortBy);
  const sortByMatch = filters.sortBy === 'match' && Boolean(options.profile);

  // A search term is ranked by keyword relevance across every match before
  // paginating; a page-sized DB slice would only re-sort within itself.
  if (filters.search) {
    const search = filters.search;
    // ILIKE is a coarse pass ("ai" is inside "said"); the whole-word rule runs here,
    // so the lanes are counted from what it keeps.
    const allMatches = (await prisma.opportunity.findMany({ where: everyLane, orderBy })).filter((item) => matchesSearch(item, search));
    const lanes = await laneSummary(allMatches, now);
    const inLane = lane ? allMatches.filter((item) => laneOf(item) === lane) : allMatches;
    const ranked = inLane
      .map((item) => ({ item, relevance: computeSearchRelevance(item, search) }))
      .sort((a, b) => b.relevance - a.relevance)
      .map((entry) => transformOpportunity(entry.item));
    const result = paginate(withMatchScores(ranked, options, sortByMatch), page, pageSize, inLane.length);
    return { ...result, items: await attachEventContext(result.items), lanes };
  }

  // Every lane's rows, as the few columns the summary and the default order need.
  const keys = await prisma.opportunity.findMany({ where: everyLane, select: LANE_ROW_SELECT });
  const lanes = await laneSummary(keys, now);

  // Best match has no column to order by: score a capped candidate set in memory.
  if (sortByMatch) {
    const [candidates, count] = await Promise.all([
      prisma.opportunity.findMany({ where, orderBy, take: MATCH_SORT_CANDIDATE_CAP }),
      prisma.opportunity.count({ where }),
    ]);
    const ranked = withMatchScores(candidates.map(transformOpportunity), options, true);
    const result = paginate(ranked, page, pageSize, Math.min(count, MATCH_SORT_CANDIDATE_CAP));
    return { ...result, items: await attachEventContext(result.items), lanes };
  }

  // The default order is not one column's (a row without a deadline closes
  // when its event starts, or is a rolling call; a lane without deadlines goes
  // by the event): sort the lane's keys in memory, then load the page's rows.
  if (sortsByClosing(filters.sortBy)) {
    const inLane = lane ? keys.filter((key) => laneOf(key) === lane) : keys;
    const pageIds = inLane
      .sort(laneComparator(lane, now))
      .slice((page - 1) * pageSize, page * pageSize)
      .map((key) => key.id);
    const rows = pageIds.length > 0 ? await prisma.opportunity.findMany({ where: { id: { in: pageIds } } }) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = pageIds.flatMap((id) => byId.get(id) ?? []);
    return {
      items: await attachEventContext(withMatchScores(ordered.map(transformOpportunity), options)),
      total: inLane.length,
      page,
      pageSize,
      totalPages: Math.ceil(inLane.length / pageSize),
      lanes,
    };
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
    lanes,
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
  /** Sector ids; left out, the row is placed by its tags. */
  sectors?: string[];
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
  applyUrl: string;
  qualityScore?: number;
  source: string;
  sourceUrl?: string;
}

export async function createOpportunity(data: OpportunityCreateInput) {
  const cfpDeadline = storableDate(data.cfpDeadline);
  const given = normalizeSectors(data.sectors);
  const opportunity = await prisma.opportunity.create({
    data: {
      ...data,
      eventDate: storableDate(data.eventDate),
      cfpDeadline,
      deadlineTimezone: cfpDeadline ? data.deadlineTimezone : null,
      industries: JSON.stringify(data.industries || []),
      sectors: given.length > 0 ? given : sectorsFromTags(data.industries),
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

// Filter options come from listed rows only: a hidden row's regex-parsed
// location ("Closes Sep") or tag is nothing a visitor can filter down to.

// Get unique locations for filter dropdown
export async function getUniqueLocations(): Promise<string[]> {
  const opportunities = await prisma.opportunity.findMany({
    where: { AND: [buildOpportunityWhere({}), { location: { not: null } }] },
    select: { location: true },
    distinct: ['location'],
  });

  return opportunities
    .map((o) => o.location)
    .filter((l): l is string => l !== null)
    .sort();
}

/**
 * Every sector with the number of cards the list shows for it (one card per
 * event, like the list itself), in the order of lib/sectors.ts. A sector with
 * no card is still returned: the filter always offers the whole list.
 */
export async function getSectorOptions(now?: Date): Promise<SectorOption[]> {
  const rows = await prisma.opportunity.findMany({
    where: await buildGroupedWhere({}, now),
    select: { sectors: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const sector of normalizeSectors(row.sectors)) counts.set(sector, (counts.get(sector) ?? 0) + 1);
  }

  return SECTORS.map((sector) => ({ id: sector.id, label: sector.label, count: counts.get(sector.id) ?? 0 }));
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
