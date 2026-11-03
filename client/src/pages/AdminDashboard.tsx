import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminLoadingSkeleton } from '../components/admin/AdminLoadingSkeleton';
import { AttentionStrip } from '../components/admin/AttentionStrip';
import { CatalogueSection } from '../components/admin/CatalogueSection';
import { DemandSection } from '../components/admin/DemandSection';
import { PipelineSection } from '../components/admin/PipelineSection';
import { SourcesSection } from '../components/admin/SourcesSection';
import { deriveAttention } from '../components/admin/attention';
import { formatRelative } from '../components/admin/formatters';
import {
  useAdminCatalogue,
  useAdminDemand,
  useAdminPipeline,
  useAdminSources,
  useRefreshAdminAnalytics,
} from '../hooks/useAdminAnalytics';
import { useAuth } from '../hooks/useAuth';

const CLOCK_TICK_MS = 30 * 1000;

/** A clock that ticks slowly so relative times ("3m ago") stay honest without re-rendering constantly. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * One screen that answers "is the pipeline healthy and what needs attention?":
 * an attention strip, then Sources, Pipeline, Catalogue and Demand.
 */
export function AdminDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.isAdmin);

  useEffect(() => {
    // Wait for the session cookie check; redirecting earlier bounces a reload to /login.
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    if (!isAdmin) {
      navigate('/');
    }
  }, [authLoading, user, isAdmin, navigate]);

  const enabled = !authLoading && isAdmin;
  const sources = useAdminSources({ enabled });
  const pipeline = useAdminPipeline({ enabled });
  const catalogue = useAdminCatalogue({ enabled });
  const demand = useAdminDemand({ enabled });
  const refresh = useRefreshAdminAnalytics();
  const now = useNow();

  const attention = useMemo(
    () => deriveAttention({ sources: sources.data?.sources, pipeline: pipeline.data, now }),
    [sources.data, pipeline.data, now]
  );

  if (authLoading || !isAdmin) {
    return <AdminLoadingSkeleton />;
  }

  const isRefreshing = sources.isFetching || pipeline.isFetching || catalogue.isFetching || demand.isFetching;
  const updatedAt = [sources.dataUpdatedAt, pipeline.dataUpdatedAt, catalogue.dataUpdatedAt, demand.dataUpdatedAt]
    .filter((stamp) => stamp > 0)
    .reduce((latest, stamp) => Math.max(latest, stamp), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {updatedAt > 0 ? `Updated ${formatRelative(new Date(updatedAt).toISOString(), now)}` : 'Loading…'}; the pipeline
            section refreshes itself every minute.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={isRefreshing}>
          <RefreshCw className={isRefreshing ? 'animate-spin' : undefined} aria-hidden="true" />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <AttentionStrip items={attention} isPending={sources.isPending || pipeline.isPending} />

      <SourcesSection data={sources.data} isPending={sources.isPending} error={sources.error} now={now} />
      <PipelineSection data={pipeline.data} isPending={pipeline.isPending} error={pipeline.error} now={now} />
      <CatalogueSection data={catalogue.data} isPending={catalogue.isPending} error={catalogue.error} />
      <DemandSection data={demand.data} isPending={demand.isPending} error={demand.error} />
    </div>
  );
}

export default AdminDashboard;
