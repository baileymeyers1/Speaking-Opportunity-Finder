import { prisma } from '../../lib/prisma.js';
import type { AdminDemandResponse, AdminSavedSearchDemand, AdminSearchLogDemand } from 'shared';
import { daysAgo, topCounts } from './shared.js';

/** What users ask for: saved searches now, the live-search log once it exists. */

export const TOP_DEMAND = 10;
const SAVED_SEARCH_SCAN_LIMIT = 5000;

export interface SavedSearchRow {
  userId: string;
  query: string | null;
  /** JSON object; see `savedSearchToFilters` on the client for the keys. */
  filters: string;
  createdAt: Date;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function parseFilters(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Pure aggregation over saved-search rows. */
export function summarizeSavedSearches(rows: SavedSearchRow[], now: Date): AdminSavedSearchDemand {
  const weekAgo = daysAgo(7, now);
  const users = new Set<string>();
  const queries = new Map<string, number>();
  const industries = new Map<string, number>();
  const locations = new Map<string, number>();
  const formats = new Map<string, number>();
  let createdLast7d = 0;
  let withQuery = 0;
  let remoteOnly = 0;

  const bump = (map: Map<string, number>, values: string[]) => {
    for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  };

  for (const row of rows) {
    users.add(row.userId);
    if (row.createdAt >= weekAgo) createdLast7d++;
    const query = row.query?.trim().toLowerCase();
    if (query) {
      withQuery++;
      bump(queries, [query]);
    }
    const filters = parseFilters(row.filters);
    bump(industries, stringArray(filters.industries));
    bump(locations, stringArray(filters.locations));
    bump(formats, stringArray(filters.format));
    if (filters.isRemote === true) remoteOnly++;
  }

  return {
    total: rows.length,
    users: users.size,
    createdLast7d,
    withQuery,
    remoteOnly,
    topQueries: topCounts(queries, TOP_DEMAND),
    topIndustries: topCounts(industries, TOP_DEMAND),
    topLocations: topCounts(locations, TOP_DEMAND),
    topFormats: topCounts(formats, TOP_DEMAND),
  };
}

/**
 * STUB: the `SearchLog` model and `GET /api/admin/analytics/search-log` are
 * being added in a parallel branch. Once they land on main, read the top
 * live-search queries here and drop the `available: false` branch.
 */
async function getSearchLogDemand(): Promise<AdminSearchLogDemand> {
  return { available: false };
}

export async function getDemand(now: Date = new Date()): Promise<AdminDemandResponse> {
  const [rows, searchLog] = await Promise.all([
    prisma.savedSearch.findMany({
      select: { userId: true, query: true, filters: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: SAVED_SEARCH_SCAN_LIMIT,
    }),
    getSearchLogDemand(),
  ]);
  return {
    savedSearches: summarizeSavedSearches(rows, now),
    searchLog,
    generatedAt: now.toISOString(),
  };
}
