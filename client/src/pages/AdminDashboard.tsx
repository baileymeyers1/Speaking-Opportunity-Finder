import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Database,
  TrendingUp,
  Activity,
  Cpu,
  BarChart3,
  Search,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  Zap,
  XCircle,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScraperHealth {
  name: string;
  status: 'online' | 'degraded' | 'unknown';
  lastRun: string | null;
  totalOpportunities: number;
  last24h: number;
  last7d: number;
  last30d: number;
  averageQualityScore: number;
}

interface SourceQuality {
  source: string;
  totalCount: number;
  last30dCount: number;
  averageQualityScore: number;
  hasDeadlinePercentage: number;
  hasLocationPercentage: number;
  hasCompensationPercentage: number;
  dataCompletenessScore: number;
}

interface DatabaseStats {
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

interface LiveSearchAnalytics {
  totalLiveSearchResults: number;
  last24h: number;
  last7d: number;
  last30d: number;
  topIndustries: Array<{ industry: string; count: number }>;
}

interface SystemHealth {
  databaseSize: number;
  opportunityGrowthRate: number;
  errorRate: number;
}

interface EnrichmentStats {
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

interface AnalyticsData {
  scraperHealth: ScraperHealth[];
  sourceQuality: SourceQuality[];
  databaseStats: DatabaseStats;
  liveSearchAnalytics: LiveSearchAnalytics;
  systemHealth: SystemHealth;
  enrichmentStats: EnrichmentStats;
  timestamp: string;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  valueClassName,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn('text-3xl font-bold text-foreground', valueClassName)}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="rounded-md bg-muted p-3">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        status === 'online' && 'bg-emerald-500',
        status === 'degraded' && 'bg-amber-500',
        status === 'unknown' && 'bg-muted-foreground'
      )}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.isAdmin;

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!isAdmin) {
      navigate('/');
      return;
    }

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 60000);

    return () => clearInterval(interval);
  }, [user, navigate]);

  async function fetchAnalytics() {
    try {
      const response = await apiClient.get<AnalyticsData>('/admin/analytics');
      if (response.data) {
        setAnalytics(response.data);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load analytics data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Failed to load analytics
        </h2>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Admin Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last updated: {new Date(analytics.timestamp).toLocaleString()}
        </p>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Opportunities"
          value={analytics.systemHealth.databaseSize}
          icon={Database}
        />
        <StatCard
          title="30-Day Growth Rate"
          value={`+${analytics.systemHealth.opportunityGrowthRate}%`}
          icon={TrendingUp}
          valueClassName="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Active Opportunities"
          value={analytics.databaseStats.activeOpportunities}
          icon={Activity}
        />
      </div>

      {/* Database Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Database Statistics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Added Last 24h</p>
              <p className="text-2xl font-semibold text-foreground">
                {analytics.databaseStats.last24hAdded}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Added Last 7d</p>
              <p className="text-2xl font-semibold text-foreground">
                {analytics.databaseStats.last7dAdded}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Added Last 30d</p>
              <p className="text-2xl font-semibold text-foreground">
                {analytics.databaseStats.last30dAdded}
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Format Breakdown
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(analytics.databaseStats.formatBreakdown).map(
                ([format, count]) => (
                  <div
                    key={format}
                    className="rounded-md bg-muted/50 p-3 text-center"
                  >
                    <p className="text-xs text-muted-foreground capitalize">
                      {format}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {count}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Top Industries
              </h3>
              <div className="space-y-2">
                {analytics.databaseStats.topIndustries
                  .slice(0, 5)
                  .map((item) => (
                    <div
                      key={item.industry}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="capitalize text-muted-foreground">
                        {item.industry}
                      </span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Top Locations
              </h3>
              <div className="space-y-2">
                {analytics.databaseStats.topLocations
                  .slice(0, 5)
                  .map((item) => (
                    <div
                      key={item.location}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {item.location}
                      </span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enrichment Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Enrichment Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-md bg-primary/5 border border-primary/10 p-4">
              <p className="text-sm text-muted-foreground mb-1">
                Records Enriched
              </p>
              <p className="text-2xl font-semibold text-primary">
                {analytics.enrichmentStats.enrichedCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {analytics.enrichmentStats.enrichmentPercentage.toFixed(1)}% of
                total
              </p>
            </div>

            <div className="rounded-md bg-emerald-500/5 border border-emerald-500/10 p-4">
              <p className="text-sm text-muted-foreground mb-1">
                Last 24 Hours
              </p>
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {analytics.enrichmentStats.recentEnrichments.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Recently enriched
              </p>
            </div>

            <div className="rounded-md bg-amber-500/5 border border-amber-500/10 p-4">
              <p className="text-sm text-muted-foreground mb-1">Skipped</p>
              <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                {analytics.enrichmentStats.skippedCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(
                  (analytics.enrichmentStats.skippedCount /
                    analytics.enrichmentStats.totalOpportunities) *
                  100
                ).toFixed(1)}
                % of total
              </p>
            </div>

            <div className="rounded-md bg-destructive/5 border border-destructive/10 p-4">
              <p className="text-sm text-muted-foreground mb-1">
                Failed/Missing
              </p>
              <p className="text-2xl font-semibold text-destructive">
                {(
                  analytics.enrichmentStats.failedCount +
                  analytics.enrichmentStats.unenrichedCount
                ).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {analytics.enrichmentStats.failedCount} failed,{' '}
                {analytics.enrichmentStats.unenrichedCount} unenriched
              </p>
            </div>
          </div>

          <Separator />

          {/* Enrichment by Source Table */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Enrichment by Source
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                      Source
                    </th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                      Total
                    </th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                      Enriched
                    </th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                      Skipped
                    </th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                      Failed
                    </th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                      Success Rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.enrichmentStats.bySource.map((source) => (
                    <tr
                      key={source.source}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-medium text-foreground">
                        {source.source}
                      </td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground">
                        {source.total.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="text-primary font-semibold">
                          {source.enriched.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-amber-600 dark:text-amber-400">
                        {source.skipped.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right text-destructive">
                        {source.failed.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span
                          className={cn(
                            'font-semibold',
                            source.enrichmentRate >= 80 &&
                              'text-emerald-600 dark:text-emerald-400',
                            source.enrichmentRate >= 50 &&
                              source.enrichmentRate < 80 &&
                              'text-amber-600 dark:text-amber-400',
                            source.enrichmentRate < 50 && 'text-destructive'
                          )}
                        >
                          {source.enrichmentRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Status legend */}
          <div className="rounded-md bg-muted/50 p-4 text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold text-foreground mb-2">
              Status Definitions:
            </p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span>
                <span className="font-semibold text-primary">Enriched:</span>{' '}
                Successfully enriched with Claude API
              </span>
            </div>
            <div className="flex items-center gap-2">
              <SkipForward className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  Skipped:
                </span>{' '}
                Already had complete data from scraper
              </span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              <span>
                <span className="font-semibold text-destructive">Failed:</span>{' '}
                Enrichment attempted but failed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                <span className="font-semibold">Unenriched:</span> Never
                attempted enrichment
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scraper Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Scraper Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                    Scraper
                  </th>
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Total
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    24h
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    7d
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    30d
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Avg Quality
                  </th>
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                    Last Run
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.scraperHealth.map((scraper) => (
                  <tr
                    key={scraper.name}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-medium text-foreground">
                      {scraper.name}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <StatusDot status={scraper.status} />
                        <span className="capitalize text-muted-foreground">
                          {scraper.status}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right text-foreground">
                      {scraper.totalOpportunities}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {scraper.last24h}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {scraper.last7d}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {scraper.last30d}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {scraper.averageQualityScore}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">
                      {scraper.lastRun
                        ? new Date(scraper.lastRun).toLocaleString()
                        : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Source Quality */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Source Quality Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                    Source
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Total
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Last 30d
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Avg Quality
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Has Deadline
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Has Location
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Has Comp
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Completeness
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.sourceQuality.map((source) => (
                  <tr
                    key={source.source}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-medium text-foreground">
                      {source.source}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {source.totalCount}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {source.last30dCount}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {source.averageQualityScore}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {source.hasDeadlinePercentage}%
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {source.hasLocationPercentage}%
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {source.hasCompensationPercentage}%
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span
                        className={cn(
                          'font-semibold',
                          source.dataCompletenessScore >= 70 &&
                            'text-emerald-600 dark:text-emerald-400',
                          source.dataCompletenessScore >= 40 &&
                            source.dataCompletenessScore < 70 &&
                            'text-amber-600 dark:text-amber-400',
                          source.dataCompletenessScore < 40 &&
                            'text-destructive'
                        )}
                      >
                        {source.dataCompletenessScore}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Live Search Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Live Search Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Total Results</p>
              <p className="text-2xl font-semibold text-foreground">
                {analytics.liveSearchAnalytics.totalLiveSearchResults}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Last 24h</p>
              <p className="text-2xl font-semibold text-foreground">
                {analytics.liveSearchAnalytics.last24h}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Last 7d</p>
              <p className="text-2xl font-semibold text-foreground">
                {analytics.liveSearchAnalytics.last7d}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Last 30d</p>
              <p className="text-2xl font-semibold text-foreground">
                {analytics.liveSearchAnalytics.last30d}
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Top Industries from Live Searches
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {analytics.liveSearchAnalytics.topIndustries.map((item) => (
                <div
                  key={item.industry}
                  className="rounded-md bg-muted/50 p-3 text-center"
                >
                  <p className="text-xs text-muted-foreground capitalize">
                    {item.industry}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {item.count}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminDashboard;
