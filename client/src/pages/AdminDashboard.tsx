import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { AdminLoadingSkeleton } from '../components/admin/AdminLoadingSkeleton';
import { DatabaseStatsCard } from '../components/admin/DatabaseStatsCard';
import { EnrichmentCard } from '../components/admin/EnrichmentCard';
import { LiveSearchAnalyticsCard } from '../components/admin/LiveSearchAnalyticsCard';
import { ScraperHealthCard } from '../components/admin/ScraperHealthCard';
import { ScraperRunsPanel } from '../components/admin/ScraperRunsPanel';
import { SourceQualityCard } from '../components/admin/SourceQualityCard';
import { StatCard } from '../components/admin/StatCard';
import type { AnalyticsData } from '../components/admin/types';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

import { Database, TrendingUp, Activity, AlertCircle } from 'lucide-react';

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
    return <AdminLoadingSkeleton />;
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


      <DatabaseStatsCard stats={analytics.databaseStats} />

      <EnrichmentCard stats={analytics.enrichmentStats} />

      <ScraperHealthCard scrapers={analytics.scraperHealth} />

      <SourceQualityCard sources={analytics.sourceQuality} />

      <LiveSearchAnalyticsCard analytics={analytics.liveSearchAnalytics} />

      {/* Per-run scraper history (ScraperRun table) */}
      <ScraperRunsPanel />
    </div>
  );
}

export default AdminDashboard;
