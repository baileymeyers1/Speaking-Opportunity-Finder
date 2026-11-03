import { prisma } from '../../lib/prisma.js';
import type { AdminSearchLogResponse } from 'shared';
import { daysAgo } from './shared.js';

/**
 * What people search for live, for the admin dashboard. The same log feeds
 * the daily Linkup run's promoted queries (services/searchLog.ts).
 */

export const TOP_SEARCH_QUERIES = 25;

export async function getSearchLogAnalytics(limit = TOP_SEARCH_QUERIES, now: Date = new Date()): Promise<AdminSearchLogResponse> {
  const sevenDaysAgo = daysAgo(7, now);
  const thirtyDaysAgo = daysAgo(30, now);

  const [total7d, total30d, groups] = await Promise.all([
    prisma.searchLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.searchLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.searchLog.groupBy({
      by: ['query'],
      where: { createdAt: { gte: thirtyDaysAgo }, query: { not: '' } },
      _count: { query: true },
      _avg: { resultCount: true },
      _max: { createdAt: true },
      orderBy: { _count: { query: 'desc' } },
    }),
  ]);

  return {
    total7d,
    total30d,
    distinctQueries30d: groups.length,
    topQueries: groups.slice(0, limit).map((group) => ({
      query: group.query,
      count: group._count.query,
      averageResults: Math.round(group._avg.resultCount ?? 0),
      lastSearchedAt: group._max.createdAt?.toISOString() ?? null,
    })),
  };
}
