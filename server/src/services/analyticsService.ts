import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ScraperHealth {
  name: string;
  status: 'online' | 'degraded' | 'unknown';
  lastRun: Date | null;
  totalOpportunities: number;
  last24h: number;
  last7d: number;
  last30d: number;
  averageQualityScore: number;
}

export interface SourceQuality {
  source: string;
  totalCount: number;
  last30dCount: number;
  averageQualityScore: number;
  hasDeadlinePercentage: number;
  hasLocationPercentage: number;
  hasCompensationPercentage: number;
  dataCompletenessScore: number;
}

export interface DatabaseStats {
  totalOpportunities: number;
  activeOpportunities: number;
  expiredOpportunities: number;
  last24hAdded: number;
  last7dAdded: number;
  last30dAdded: number;
  formatBreakdown: Record<string, number>;
  topIndustries: Array<{ industry: string; count: number }>;
  topLocations: Array<{ location: string; count: number }>;
  qualityDistribution: Record<string, number>;
}

export interface LiveSearchAnalytics {
  totalLiveSearchResults: number;
  last24h: number;
  last7d: number;
  last30d: number;
  topIndustries: Array<{ industry: string; count: number }>;
}

export interface SystemHealth {
  databaseSize: number;
  opportunityGrowthRate: number;
  errorRate: number;
}

export interface EnrichmentStats {
  totalOpportunities: number;
  enrichedCount: number;
  enrichmentPercentage: number;
  skippedCount: number;
  failedCount: number;
  unenrichedCount: number;
  recentEnrichments: number;
  bySource: Array<{
    source: string;
    total: number;
    enriched: number;
    skipped: number;
    failed: number;
    enrichmentRate: number;
  }>;
}

/**
 * Get scraper health metrics
 * Uses 4 groupBy queries instead of 90 individual queries (15 scrapers x 6 queries each)
 */
export async function getScraperHealth(): Promise<ScraperHealth[]> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 4 queries instead of 90
  const [allSourceData, last24h, last7d, last30d] = await Promise.all([
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      _max: { createdAt: true },
      _avg: { qualityScore: true },
    }),
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      where: { createdAt: { gte: oneDayAgo } },
    }),
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const last24hMap = Object.fromEntries(last24h.map(s => [s.source, s._count.id]));
  const last7dMap = Object.fromEntries(last7d.map(s => [s.source, s._count.id]));
  const last30dMap = Object.fromEntries(last30d.map(s => [s.source, s._count.id]));

  const healthMetrics: ScraperHealth[] = allSourceData.map(source => {
    const lastRun = source._max.createdAt ? new Date(source._max.createdAt) : null;
    const hoursSinceLastRun = lastRun
      ? (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)
      : Infinity;

    let status: 'online' | 'degraded' | 'unknown';
    if (lastRun) {
      if (hoursSinceLastRun < 48) {
        status = 'online';
      } else if (hoursSinceLastRun < 168) {
        status = 'degraded';
      } else {
        status = 'unknown';
      }
    } else {
      status = 'unknown';
    }

    return {
      name: source.source,
      status,
      lastRun,
      totalOpportunities: source._count.id,
      last24h: last24hMap[source.source] || 0,
      last7d: last7dMap[source.source] || 0,
      last30d: last30dMap[source.source] || 0,
      averageQualityScore: Math.round(source._avg.qualityScore || 0),
    };
  });

  return healthMetrics.sort((a, b) => b.totalOpportunities - a.totalOpportunities);
}

/**
 * Get source quality metrics
 * Uses 5 groupBy queries instead of N*5 per-source queries
 */
export async function getSourceQuality(): Promise<SourceQuality[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 5 parallel groupBy queries instead of per-source loops
  const [sourceTotals, last30dBySource, withDeadline, withLocation, withCompensation] = await Promise.all([
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: true,
      _avg: { qualityScore: true },
    }),
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      where: { cfpDeadline: { not: null } },
    }),
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      where: { location: { not: null } },
    }),
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      where: {
        OR: [
          { compensationType: { not: null } },
          { compensationAmount: { not: null } },
        ],
      },
    }),
  ]);

  const last30dMap = Object.fromEntries(last30dBySource.map(s => [s.source, s._count.id]));
  const deadlineMap = Object.fromEntries(withDeadline.map(s => [s.source, s._count.id]));
  const locationMap = Object.fromEntries(withLocation.map(s => [s.source, s._count.id]));
  const compMap = Object.fromEntries(withCompensation.map(s => [s.source, s._count.id]));

  const qualityMetrics: SourceQuality[] = sourceTotals.map(source => {
    const total = source._count;
    const hasDeadlinePercentage = total > 0 ? Math.round(((deadlineMap[source.source] || 0) / total) * 100) : 0;
    const hasLocationPercentage = total > 0 ? Math.round(((locationMap[source.source] || 0) / total) * 100) : 0;
    const hasCompensationPercentage = total > 0 ? Math.round(((compMap[source.source] || 0) / total) * 100) : 0;
    const dataCompletenessScore = Math.round(
      (hasDeadlinePercentage + hasLocationPercentage + hasCompensationPercentage) / 3
    );

    return {
      source: source.source,
      totalCount: total,
      last30dCount: last30dMap[source.source] || 0,
      averageQualityScore: Math.round(source._avg.qualityScore || 0),
      hasDeadlinePercentage,
      hasLocationPercentage,
      hasCompensationPercentage,
      dataCompletenessScore,
    };
  });

  return qualityMetrics.sort((a, b) => b.totalCount - a.totalCount);
}

/**
 * Get database statistics
 * Uses count/groupBy queries + capped findMany instead of loading ALL opportunities into memory
 */
export async function getDatabaseStats(): Promise<DatabaseStats> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalOpportunities,
    activeOpportunities,
    expiredOpportunities,
    last24hAdded,
    last7dAdded,
    last30dAdded,
    formatGroups,
    qualityBucket0_20,
    qualityBucket21_40,
    qualityBucket41_60,
    qualityBucket61_80,
    qualityBucket81_100,
    recentOpportunities,
  ] = await Promise.all([
    prisma.opportunity.count(),
    prisma.opportunity.count({
      where: {
        OR: [
          { cfpDeadline: { gte: now } },
          { cfpDeadline: null },
        ],
      },
    }),
    prisma.opportunity.count({
      where: {
        cfpDeadline: { lt: now },
      },
    }),
    prisma.opportunity.count({
      where: { createdAt: { gte: oneDayAgo } },
    }),
    prisma.opportunity.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.opportunity.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.opportunity.groupBy({
      by: ['format'],
      _count: true,
    }),
    // Quality distribution buckets - 5 count queries instead of loading all records
    prisma.opportunity.count({
      where: { OR: [{ qualityScore: { lte: 20 } }, { qualityScore: null }] },
    }),
    prisma.opportunity.count({
      where: { qualityScore: { gt: 20, lte: 40 } },
    }),
    prisma.opportunity.count({
      where: { qualityScore: { gt: 40, lte: 60 } },
    }),
    prisma.opportunity.count({
      where: { qualityScore: { gt: 60, lte: 80 } },
    }),
    prisma.opportunity.count({
      where: { qualityScore: { gt: 80 } },
    }),
    // Only load active opportunities for industry/location extraction (capped at 5000)
    prisma.opportunity.findMany({
      select: { industries: true, location: true },
      take: 5000,
    }),
  ]);

  // Format breakdown
  const formatBreakdown: Record<string, number> = {};
  formatGroups.forEach((group) => {
    formatBreakdown[group.format] = group._count;
  });

  // Top industries (parsed from JSON strings)
  const industryCounts: Record<string, number> = {};
  for (const opp of recentOpportunities) {
    try {
      const industries = JSON.parse(opp.industries);
      if (Array.isArray(industries)) {
        for (const industry of industries) {
          industryCounts[industry] = (industryCounts[industry] || 0) + 1;
        }
      }
    } catch {
      // Skip invalid JSON
    }
  }
  const topIndustries = Object.entries(industryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([industry, count]) => ({ industry, count }));

  // Top locations
  const locationCounts: Record<string, number> = {};
  for (const opp of recentOpportunities) {
    if (opp.location) {
      locationCounts[opp.location] = (locationCounts[opp.location] || 0) + 1;
    }
  }
  const topLocations = Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([location, count]) => ({ location, count }));

  // Quality distribution from pre-computed counts
  const qualityDistribution: Record<string, number> = {
    '0-20': qualityBucket0_20,
    '21-40': qualityBucket21_40,
    '41-60': qualityBucket41_60,
    '61-80': qualityBucket61_80,
    '81-100': qualityBucket81_100,
  };

  return {
    totalOpportunities,
    activeOpportunities,
    expiredOpportunities,
    last24hAdded,
    last7dAdded,
    last30dAdded,
    formatBreakdown,
    topIndustries,
    topLocations,
    qualityDistribution,
  };
}

/**
 * Get live search analytics
 * Caps the findMany for industry extraction instead of loading all live search results
 */
export async function getLiveSearchAnalytics(): Promise<LiveSearchAnalytics> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalLiveSearchResults, last24h, last7d, last30d, liveResults] = await Promise.all([
    prisma.opportunity.count({
      where: {
        source: { startsWith: 'Live Search' },
      },
    }),
    prisma.opportunity.count({
      where: {
        source: { startsWith: 'Live Search' },
        createdAt: { gte: oneDayAgo },
      },
    }),
    prisma.opportunity.count({
      where: {
        source: { startsWith: 'Live Search' },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.opportunity.count({
      where: {
        source: { startsWith: 'Live Search' },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    // Cap at 5000 to avoid loading all live search results into memory
    prisma.opportunity.findMany({
      where: {
        source: { startsWith: 'Live Search' },
      },
      select: { industries: true },
      take: 5000,
    }),
  ]);

  // Top industries from live searches
  const industryCounts: Record<string, number> = {};
  for (const result of liveResults) {
    try {
      const industries = JSON.parse(result.industries);
      if (Array.isArray(industries)) {
        for (const industry of industries) {
          industryCounts[industry] = (industryCounts[industry] || 0) + 1;
        }
      }
    } catch {
      // Skip invalid JSON
    }
  }
  const topIndustries = Object.entries(industryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([industry, count]) => ({ industry, count }));

  return {
    totalLiveSearchResults,
    last24h,
    last7d,
    last30d,
    topIndustries,
  };
}

/**
 * Get system health metrics
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [currentCount, thirtyDaysAgoCount] = await Promise.all([
    prisma.opportunity.count(),
    prisma.opportunity.count({
      where: {
        createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const addedLast30d = currentCount - thirtyDaysAgoCount;
  const opportunityGrowthRate = thirtyDaysAgoCount > 0
    ? Math.round((addedLast30d / thirtyDaysAgoCount) * 100)
    : 0;

  return {
    databaseSize: currentCount,
    opportunityGrowthRate,
    errorRate: 0, // To be implemented with error tracking
  };
}

/**
 * Get enrichment statistics
 * Uses groupBy with [source, enrichmentStatus] instead of per-source loops
 */
export async function getEnrichmentStats(): Promise<EnrichmentStats> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // 4 queries instead of N*3+5 (where N = number of sources)
  const [enrichedCount, skippedCount, failedCount, unenrichedCount, recentEnrichments, bySourceStatus] =
    await Promise.all([
      prisma.opportunity.count({
        where: { enrichmentStatus: 'enriched' },
      }),
      prisma.opportunity.count({
        where: { enrichmentStatus: 'skipped' },
      }),
      prisma.opportunity.count({
        where: { enrichmentStatus: 'failed' },
      }),
      prisma.opportunity.count({
        where: { enrichmentStatus: null },
      }),
      prisma.opportunity.count({
        where: {
          enrichmentStatus: 'enriched',
          enrichedAt: { gte: oneDayAgo },
        },
      }),
      // Single groupBy replaces N*3 per-source queries
      prisma.opportunity.groupBy({
        by: ['source', 'enrichmentStatus'],
        _count: { id: true },
      }),
    ]);

  const totalOpportunities = enrichedCount + skippedCount + failedCount + unenrichedCount;

  // Build per-source enrichment breakdown from the single groupBy result
  const sourceMap: Record<string, { enriched: number; skipped: number; failed: number; unenriched: number }> = {};
  for (const row of bySourceStatus) {
    if (!sourceMap[row.source]) {
      sourceMap[row.source] = { enriched: 0, skipped: 0, failed: 0, unenriched: 0 };
    }
    const status = row.enrichmentStatus || 'unenriched';
    if (status === 'enriched') {
      sourceMap[row.source].enriched = row._count.id;
    } else if (status === 'skipped') {
      sourceMap[row.source].skipped = row._count.id;
    } else if (status === 'failed') {
      sourceMap[row.source].failed = row._count.id;
    } else {
      sourceMap[row.source].unenriched = row._count.id;
    }
  }

  const bySource = Object.entries(sourceMap).map(([source, statuses]) => {
    const total = statuses.enriched + statuses.skipped + statuses.failed + statuses.unenriched;
    return {
      source,
      total,
      enriched: statuses.enriched,
      skipped: statuses.skipped,
      failed: statuses.failed,
      enrichmentRate: total > 0 ? (statuses.enriched / total) * 100 : 0,
    };
  });

  // Sort by total count descending
  bySource.sort((a, b) => b.total - a.total);

  return {
    totalOpportunities,
    enrichedCount,
    enrichmentPercentage:
      totalOpportunities > 0 ? (enrichedCount / totalOpportunities) * 100 : 0,
    skippedCount,
    failedCount,
    unenrichedCount,
    recentEnrichments,
    bySource,
  };
}

/**
 * Get all analytics data
 */
export async function getAllAnalytics() {
  const [scraperHealth, sourceQuality, databaseStats, liveSearchAnalytics, systemHealth, enrichmentStats] =
    await Promise.all([
      getScraperHealth(),
      getSourceQuality(),
      getDatabaseStats(),
      getLiveSearchAnalytics(),
      getSystemHealth(),
      getEnrichmentStats(),
    ]);

  return {
    scraperHealth,
    sourceQuality,
    databaseStats,
    liveSearchAnalytics,
    systemHealth,
    enrichmentStats,
    timestamp: new Date().toISOString(),
  };
}
