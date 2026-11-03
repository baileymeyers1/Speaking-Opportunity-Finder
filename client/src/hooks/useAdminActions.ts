import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { AdminEnrichmentBatchResult, AdminScraperRunResult, ScraperCadence } from '../types';
import { adminQueryKeys } from './useAdminAnalytics';

async function unwrap<T>(promise: Promise<{ data?: T; error?: string }>): Promise<T> {
  const response = await promise;
  if (!response.data) throw new Error(response.error || 'Empty response');
  return response.data;
}

/** Run one scraper now through the existing sync endpoint; the sources table refetches after. */
export function useRunScraper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, cadence }: { name: string; cadence: ScraperCadence }) => {
      const params = new URLSearchParams({ mode: cadence, scraper: name });
      return unwrap(apiClient.post<AdminScraperRunResult>(`/sync?${params.toString()}`, {}));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.sources });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pipeline });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.catalogue });
    },
  });
}

/** Run one enrichment batch now, the same work the 5-minute cron does. */
export function useRunEnrichmentBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(apiClient.post<AdminEnrichmentBatchResult>('/admin/enrichment/run', {})),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.pipeline });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.sources });
    },
  });
}
