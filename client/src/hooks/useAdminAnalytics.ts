import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type {
  AdminCatalogueResponse,
  AdminDemandResponse,
  AdminPipelineResponse,
  AdminSourcesResponse,
} from '../types';
import { ONE_MINUTE } from '../lib/queryClient';

/** One query per admin endpoint; `all` is what the Refresh button invalidates. */
export const adminQueryKeys = {
  all: ['admin'] as const,
  sources: ['admin', 'sources'] as const,
  pipeline: ['admin', 'pipeline'] as const,
  catalogue: ['admin', 'catalogue'] as const,
  demand: ['admin', 'demand'] as const,
};

interface AdminQueryOptions {
  enabled: boolean;
}

async function fetchSection<T>(path: string, signal: AbortSignal | undefined): Promise<T> {
  const response = await apiClient.get<T>(path, { signal });
  if (!response.data) throw new Error(response.error || 'Empty response');
  return response.data;
}

/** Scraper health changes once a day at most, apart from manual runs, which invalidate it. */
export function useAdminSources({ enabled }: AdminQueryOptions) {
  return useQuery({
    queryKey: adminQueryKeys.sources,
    queryFn: ({ signal }) => fetchSection<AdminSourcesResponse>('/admin/analytics/sources', signal),
    enabled,
    staleTime: 5 * ONE_MINUTE,
  });
}

/** The pipeline moves every five minutes; keep it live while the page is open. */
export function useAdminPipeline({ enabled }: AdminQueryOptions) {
  return useQuery({
    queryKey: adminQueryKeys.pipeline,
    queryFn: ({ signal }) => fetchSection<AdminPipelineResponse>('/admin/analytics/pipeline', signal),
    enabled,
    staleTime: ONE_MINUTE,
    refetchInterval: ONE_MINUTE,
  });
}

export function useAdminCatalogue({ enabled }: AdminQueryOptions) {
  return useQuery({
    queryKey: adminQueryKeys.catalogue,
    queryFn: ({ signal }) => fetchSection<AdminCatalogueResponse>('/admin/analytics/catalogue', signal),
    enabled,
    staleTime: 5 * ONE_MINUTE,
  });
}

export function useAdminDemand({ enabled }: AdminQueryOptions) {
  return useQuery({
    queryKey: adminQueryKeys.demand,
    queryFn: ({ signal }) => fetchSection<AdminDemandResponse>('/admin/analytics/demand', signal),
    enabled,
    staleTime: 5 * ONE_MINUTE,
  });
}

/** Refetch every admin section; returns the function the Refresh button calls. */
export function useRefreshAdminAnalytics() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
}
