import { prisma } from '../lib/prisma.js';
import { LINKUP_QUERIES, promotedQueryFromSearch, type LinkupQuery } from '../scrapers/linkupQueries.js';

/**
 * The search log: one row per live search. Rows are written by the live-search
 * controllers and read by the daily Linkup run, which promotes the most
 * frequent recent queries into its slice so the stored catalogue grows toward
 * what people actually look for.
 */

export const PROMOTION_WINDOW_DAYS = 30;
/** A query searched fewer times than this in the window is a one-off, not a trend. */
export const MIN_PROMOTION_COUNT = 2;
const MAX_QUERY_LENGTH = 200;

/** Lowercase, punctuation stripped, whitespace collapsed; the form stored and grouped on. */
export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'&+.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export interface SearchLogEntry {
  query: string;
  industries: string[];
  locations: string[];
  resultCount: number;
  userId?: string | null;
}

/**
 * Record one live search. Awaited by the caller (anything left running after
 * the response is lost on Vercel), but a logging failure never fails the search.
 */
export async function recordSearch(entry: SearchLogEntry): Promise<void> {
  try {
    await prisma.searchLog.create({
      data: {
        query: normalizeSearchQuery(entry.query),
        industries: JSON.stringify(entry.industries),
        locations: JSON.stringify(entry.locations),
        resultCount: entry.resultCount,
        userId: entry.userId ?? null,
      },
    });
  } catch (error) {
    console.error('[SearchLog] Failed to record search:', error instanceof Error ? error.message : error);
  }
}

export interface QueryCount {
  query: string;
  count: number;
}

export type TopQueriesFetcher = (since: Date, take: number) => Promise<QueryCount[]>;

/** Most searched non-empty queries since `since`, most frequent first. */
export const fetchTopQueriesFromDb: TopQueriesFetcher = async (since, take) => {
  const groups = await prisma.searchLog.groupBy({
    by: ['query'],
    where: { createdAt: { gte: since }, query: { not: '' } },
    _count: { query: true },
    orderBy: { _count: { query: 'desc' } },
    take,
  });
  return groups.map((group) => ({ query: group.query, count: group._count.query }));
};

/**
 * Up to `limit` Linkup queries promoted from the search log: the most frequent
 * distinct normalized queries of the last 30 days that are searched at least
 * twice and are not already covered by the static query set.
 */
export async function promotedLinkupQueries(
  limit: number,
  now: Date = new Date(),
  fetchTopQueries: TopQueriesFetcher = fetchTopQueriesFromDb,
  staticQueries: readonly LinkupQuery[] = LINKUP_QUERIES,
): Promise<LinkupQuery[]> {
  if (limit <= 0) return [];
  const since = new Date(now.getTime() - PROMOTION_WINDOW_DAYS * 86_400_000);
  const covered = new Set(staticQueries.map((entry) => normalizeSearchQuery(entry.query)));

  let candidates: QueryCount[];
  try {
    candidates = await fetchTopQueries(since, limit + 20);
  } catch (error) {
    console.error('[SearchLog] Could not read top queries:', error instanceof Error ? error.message : error);
    return [];
  }

  const promoted: LinkupQuery[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (promoted.length >= limit) break;
    if (candidate.count < MIN_PROMOTION_COUNT) continue;
    const normalized = normalizeSearchQuery(candidate.query);
    if (normalized.length < 3 || seen.has(normalized) || covered.has(normalized)) continue;
    const query = promotedQueryFromSearch(normalized);
    if (covered.has(normalizeSearchQuery(query.query))) continue;
    seen.add(normalized);
    promoted.push(query);
  }
  return promoted;
}
