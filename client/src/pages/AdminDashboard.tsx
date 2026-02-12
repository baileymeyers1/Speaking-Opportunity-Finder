import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

// Admin emails list
const ADMIN_EMAILS = ['baileymeyers1@gmail.com'];

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

export function AdminDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Check if user is admin
    if (!isAdmin) {
      navigate('/');
      return;
    }

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 60000); // Refresh every minute

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
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admin Analytics Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Last updated: {new Date(analytics.timestamp).toLocaleString()}
        </p>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Opportunities</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {analytics.systemHealth.databaseSize.toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">30-Day Growth Rate</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">
            +{analytics.systemHealth.opportunityGrowthRate}%
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Active Opportunities</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {analytics.databaseStats.activeOpportunities.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Database Statistics */}
      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <h2 className="text-xl font-bold mb-4">Database Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Added Last 24h</p>
            <p className="text-2xl font-semibold">{analytics.databaseStats.last24hAdded}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Added Last 7d</p>
            <p className="text-2xl font-semibold">{analytics.databaseStats.last7dAdded}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Added Last 30d</p>
            <p className="text-2xl font-semibold">{analytics.databaseStats.last30dAdded}</p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold mb-2">Format Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(analytics.databaseStats.formatBreakdown).map(([format, count]) => (
              <div key={format} className="bg-gray-50 p-2 rounded">
                <p className="text-xs text-gray-600 capitalize">{format}</p>
                <p className="font-semibold">{count}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold mb-2">Top Industries</h3>
            <div className="space-y-1">
              {analytics.databaseStats.topIndustries.slice(0, 5).map((item) => (
                <div key={item.industry} className="flex justify-between text-sm">
                  <span className="capitalize">{item.industry}</span>
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Top Locations</h3>
            <div className="space-y-1">
              {analytics.databaseStats.topLocations.slice(0, 5).map((item) => (
                <div key={item.location} className="flex justify-between text-sm">
                  <span>{item.location}</span>
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Enrichment Analytics */}
      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center">
          <span className="mr-2">🤖</span>
          Enrichment Analytics
        </h2>

        {/* Summary Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Enriched Records */}
          <div className="bg-blue-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">Records Enriched</p>
            <p className="text-2xl font-semibold text-blue-600">
              {analytics.enrichmentStats.enrichedCount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {analytics.enrichmentStats.enrichmentPercentage.toFixed(1)}% of total
            </p>
          </div>

          {/* Recent Enrichments */}
          <div className="bg-green-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">Last 24 Hours</p>
            <p className="text-2xl font-semibold text-green-600">
              {analytics.enrichmentStats.recentEnrichments.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">Recently enriched</p>
          </div>

          {/* Skipped */}
          <div className="bg-yellow-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">Skipped</p>
            <p className="text-2xl font-semibold text-yellow-600">
              {analytics.enrichmentStats.skippedCount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {((analytics.enrichmentStats.skippedCount / analytics.enrichmentStats.totalOpportunities) * 100).toFixed(1)}% of total
            </p>
          </div>

          {/* Failed + Unenriched */}
          <div className="bg-red-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">Failed/Missing</p>
            <p className="text-2xl font-semibold text-red-600">
              {(analytics.enrichmentStats.failedCount + analytics.enrichmentStats.unenrichedCount).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {analytics.enrichmentStats.failedCount} failed, {analytics.enrichmentStats.unenrichedCount} unenriched
            </p>
          </div>
        </div>

        {/* Enrichment by Source Table */}
        <div>
          <h3 className="font-semibold mb-3">Enrichment by Source</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-4 font-semibold">Source</th>
                  <th className="text-right py-2 px-4 font-semibold">Total</th>
                  <th className="text-right py-2 px-4 font-semibold">Enriched</th>
                  <th className="text-right py-2 px-4 font-semibold">Skipped</th>
                  <th className="text-right py-2 px-4 font-semibold">Failed</th>
                  <th className="text-right py-2 px-4 font-semibold">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics.enrichmentStats.bySource.map((source) => (
                  <tr key={source.source} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium">{source.source}</td>
                    <td className="py-2 px-4 text-right text-gray-700">
                      {source.total.toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <span className="text-blue-600 font-semibold">
                        {source.enriched.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right text-yellow-600">
                      {source.skipped.toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-right text-red-600">
                      {source.failed.toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <span className={`font-semibold ${
                        source.enrichmentRate >= 80 ? 'text-green-600' :
                        source.enrichmentRate >= 50 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {source.enrichmentRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Enrichment Status Legend */}
        <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
          <p className="font-semibold mb-2">Status Definitions:</p>
          <ul className="space-y-1">
            <li><span className="font-semibold text-blue-600">Enriched:</span> Successfully enriched with Claude API</li>
            <li><span className="font-semibold text-yellow-600">Skipped:</span> Already had complete data from scraper</li>
            <li><span className="font-semibold text-red-600">Failed:</span> Enrichment attempted but failed</li>
            <li><span className="font-semibold text-gray-600">Unenriched:</span> Never attempted enrichment</li>
          </ul>
        </div>
      </div>

      {/* Scraper Health */}
      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <h2 className="text-xl font-bold mb-4">Scraper Health</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4">Scraper</th>
                <th className="text-left py-2 px-4">Status</th>
                <th className="text-right py-2 px-4">Total</th>
                <th className="text-right py-2 px-4">24h</th>
                <th className="text-right py-2 px-4">7d</th>
                <th className="text-right py-2 px-4">30d</th>
                <th className="text-right py-2 px-4">Avg Quality</th>
                <th className="text-left py-2 px-4">Last Run</th>
              </tr>
            </thead>
            <tbody>
              {analytics.scraperHealth.map((scraper) => (
                <tr key={scraper.name} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium">{scraper.name}</td>
                  <td className="py-2 px-4">
                    <span className="flex items-center">
                      <span className={`w-2 h-2 rounded-full ${getStatusColor(scraper.status)} mr-2`}></span>
                      {scraper.status}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right">{scraper.totalOpportunities}</td>
                  <td className="py-2 px-4 text-right">{scraper.last24h}</td>
                  <td className="py-2 px-4 text-right">{scraper.last7d}</td>
                  <td className="py-2 px-4 text-right">{scraper.last30d}</td>
                  <td className="py-2 px-4 text-right">{scraper.averageQualityScore}</td>
                  <td className="py-2 px-4 text-xs text-gray-600">
                    {scraper.lastRun ? new Date(scraper.lastRun).toLocaleString() : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Source Quality */}
      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <h2 className="text-xl font-bold mb-4">Source Quality Metrics</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4">Source</th>
                <th className="text-right py-2 px-4">Total</th>
                <th className="text-right py-2 px-4">Last 30d</th>
                <th className="text-right py-2 px-4">Avg Quality</th>
                <th className="text-right py-2 px-4">Has Deadline</th>
                <th className="text-right py-2 px-4">Has Location</th>
                <th className="text-right py-2 px-4">Has Comp</th>
                <th className="text-right py-2 px-4">Completeness</th>
              </tr>
            </thead>
            <tbody>
              {analytics.sourceQuality.map((source) => (
                <tr key={source.source} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium">{source.source}</td>
                  <td className="py-2 px-4 text-right">{source.totalCount}</td>
                  <td className="py-2 px-4 text-right">{source.last30dCount}</td>
                  <td className="py-2 px-4 text-right">{source.averageQualityScore}</td>
                  <td className="py-2 px-4 text-right">{source.hasDeadlinePercentage}%</td>
                  <td className="py-2 px-4 text-right">{source.hasLocationPercentage}%</td>
                  <td className="py-2 px-4 text-right">{source.hasCompensationPercentage}%</td>
                  <td className="py-2 px-4 text-right">
                    <span className={`font-semibold ${
                      source.dataCompletenessScore >= 70 ? 'text-green-600' :
                      source.dataCompletenessScore >= 40 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {source.dataCompletenessScore}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Search Analytics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Live Search Analytics</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">Total Results</p>
            <p className="text-2xl font-semibold">{analytics.liveSearchAnalytics.totalLiveSearchResults}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Last 24h</p>
            <p className="text-2xl font-semibold">{analytics.liveSearchAnalytics.last24h}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Last 7d</p>
            <p className="text-2xl font-semibold">{analytics.liveSearchAnalytics.last7d}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Last 30d</p>
            <p className="text-2xl font-semibold">{analytics.liveSearchAnalytics.last30d}</p>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Top Industries from Live Searches</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {analytics.liveSearchAnalytics.topIndustries.map((item) => (
              <div key={item.industry} className="bg-gray-50 p-2 rounded">
                <p className="text-xs text-gray-600 capitalize">{item.industry}</p>
                <p className="font-semibold">{item.count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
