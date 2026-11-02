export interface ScraperHealth {
  name: string;
  status: 'online' | 'degraded' | 'unknown';
  lastRun: string | null;
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

export interface AnalyticsData {
  scraperHealth: ScraperHealth[];
  sourceQuality: SourceQuality[];
  databaseStats: DatabaseStats;
  liveSearchAnalytics: LiveSearchAnalytics;
  systemHealth: SystemHealth;
  enrichmentStats: EnrichmentStats;
  timestamp: string;
}
