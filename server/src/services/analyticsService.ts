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
 */
export async function getScraperHealth(): Promise<ScraperHealth[]> {
  const scraperNames = [
    'confs.tech',
    'javaconferences.org',
    'callingallpapers.com',
    'sessionize.com',
    'papercall.io',
    'wikicfp.com',
    'Linkup Search',
    'eventbrite.com',
    'US Mega Events',
    'conferencealerts.com',
    'developers.events',
    'Airtable',
    'pac.org',
    'prnewsonline.com',
    'Live Search',
  ];

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const healthMetrics = await Promise.all(
    scraperNames.map(async (name) => {
      const [
        totalOpportunities,
        last24h,
        last7d,
        last30d,
        avgQuality,
        lastRunRecord,
      ] = await Promise.all([
        prisma.opportunity.count({
          where: { source: name },
        }),
        prisma.opportunity.count({
          where: {
            source: name,
            createdAt: { gte: oneDayAgo },
          },
        }),
        prisma.opportunity.count({
          where: {
            source: name,
            createdAt: { gte: sevenDaysAgo },
          },
        }),
        prisma.opportunity.count({
          where: {
            source: name,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        prisma.opportunity.aggregate({
          where: { source: name },
          _avg: { qualityScore: true },
        }),
        prisma.opportunity.findFirst({
          where: { source: name },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

      // Determine status based on recent activity
      let status: 'online' | 'degraded' | 'unknown';
      if (lastRunRecord) {
        const hoursSinceLastRun = (now.getTime() - lastRunRecord.createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastRun < 48) {
          status = 'online';
        } else if (hoursSinceLastRun < 168) { // 7 days
          status = 'degraded';
        } else {
          status = 'unknown';
        }
      } else {
        status = 'unknown';
      }

      return {
        name,
        status,
        lastRun: lastRunRecord?.createdAt || null,
        totalOpportunities,
        last24h,
        last7d,
        last30d,
        averageQualityScore: Math.round(avgQuality._avg.qualityScore || 0),
      };
    })
  );

  return healthMetrics.sort((a, b) => b.totalOpportunities - a.totalOpportunities);
}

/**
 * Get source quality metrics
 */
export async function getSourceQuality(): Promise<SourceQuality[]> {
  const sources = await prisma.opportunity.groupBy({
    by: ['source'],
    _count: true,
    _avg: { qualityScore: true },
  });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const qualityMetrics = await Promise.all(
    sources.map(async (source) => {
      const [last30dCount, hasDeadline, hasLocation, hasCompensation, total] = await Promise.all([
        prisma.opportunity.count({
          where: {
            source: source.source,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        prisma.opportunity.count({
          where: {
            source: source.source,
            cfpDeadline: { not: null },
          },
        }),
        prisma.opportunity.count({
          where: {
            source: source.source,
            location: { not: null },
          },
        }),
        prisma.opportunity.count({
          where: {
            source: source.source,
            OR: [
              { compensationType: { not: null } },
              { compensationAmount: { not: null } },
            ],
          },
        }),
        prisma.opportunity.count({
          where: { source: source.source },
        }),
      ]);

      const hasDeadlinePercentage = Math.round((hasDeadline / total) * 100);
      const hasLocationPercentage = Math.round((hasLocation / total) * 100);
      const hasCompensationPercentage = Math.round((hasCompensation / total) * 100);
      const dataCompletenessScore = Math.round(
        (hasDeadlinePercentage + hasLocationPercentage + hasCompensationPercentage) / 3
      );

      return {
        source: source.source,
        totalCount: source._count,
        last30dCount,
        averageQualityScore: Math.round(source._avg.qualityScore || 0),
        hasDeadlinePercentage,
        hasLocationPercentage,
        hasCompensationPercentage,
        dataCompletenessScore,
      };
    })
  );

  return qualityMetrics.sort((a, b) => b.totalCount - a.totalCount);
}

/**
 * Get database statistics
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
    allOpportunities,
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
    prisma.opportunity.findMany({
      select: { industries: true, location: true, qualityScore: true },
    }),
  ]);

  // Format breakdown
  const formatBreakdown: Record<string, number> = {};
  formatGroups.forEach((group) => {
    formatBreakdown[group.format] = group._count;
  });

  // Top industries
  const industryCounts: Record<string, number> = {};
  allOpportunities.forEach((opp) => {
    try {
      const industries = JSON.parse(opp.industries);
      industries.forEach((industry: string) => {
        industryCounts[industry] = (industryCounts[industry] || 0) + 1;
      });
    } catch {
      // Skip invalid JSON
    }
  });
  const topIndustries = Object.entries(industryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([industry, count]) => ({ industry, count }));

  // Top locations
  const locationCounts: Record<string, number> = {};
  allOpportunities.forEach((opp) => {
    if (opp.location) {
      locationCounts[opp.location] = (locationCounts[opp.location] || 0) + 1;
    }
  });
  const topLocations = Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([location, count]) => ({ location, count }));

  // Quality distribution
  const qualityDistribution: Record<string, number> = {
    '0-20': 0,
    '21-40': 0,
    '41-60': 0,
    '61-80': 0,
    '81-100': 0,
  };
  allOpportunities.forEach((opp) => {
    const score = opp.qualityScore || 0;
    if (score <= 20) qualityDistribution['0-20']++;
    else if (score <= 40) qualityDistribution['21-40']++;
    else if (score <= 60) qualityDistribution['41-60']++;
    else if (score <= 80) qualityDistribution['61-80']++;
    else qualityDistribution['81-100']++;
  });

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
    prisma.opportunity.findMany({
      where: {
        source: { startsWith: 'Live Search' },
      },
      select: { industries: true },
    }),
  ]);

  // Top industries from live searches
  const industryCounts: Record<string, number> = {};
  liveResults.forEach((result) => {
    try {
      const industries = JSON.parse(result.industries);
      industries.forEach((industry: string) => {
        industryCounts[industry] = (industryCounts[industry] || 0) + 1;
      });
    } catch {
      // Skip invalid JSON
    }
  });
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
 */
export async function getEnrichmentStats(): Promise<EnrichmentStats> {
  const totalOpportunities = await prisma.opportunity.count();

  // Count by enrichment status
  const [enrichedCount, skippedCount, failedCount, unenrichedCount] = await Promise.all([
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
  ]);

  // Recent enrichments (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentEnrichments = await prisma.opportunity.count({
    where: {
      enrichmentStatus: 'enriched',
      enrichedAt: { gte: oneDayAgo },
    },
  });

  // By source
  const bySourceData = await prisma.opportunity.groupBy({
    by: ['source'],
    _count: { _all: true },
  });

  const bySource = await Promise.all(
    bySourceData.map(async (sourceGroup) => {
      const source = sourceGroup.source;
      const total = sourceGroup._count._all || 0;

      const [enriched, skipped, failed] = await Promise.all([
        prisma.opportunity.count({
          where: {
            source: sourceGroup.source,
            enrichmentStatus: 'enriched',
          },
        }),
        prisma.opportunity.count({
          where: {
            source: sourceGroup.source,
            enrichmentStatus: 'skipped',
          },
        }),
        prisma.opportunity.count({
          where: {
            source: sourceGroup.source,
            enrichmentStatus: 'failed',
          },
        }),
      ]);

      return {
        source,
        total,
        enriched,
        skipped,
        failed,
        enrichmentRate: total > 0 ? (enriched / total) * 100 : 0,
      };
    })
  );

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
