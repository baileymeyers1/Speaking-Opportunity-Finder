import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { AnalyticsData } from '../components/admin/types';
import { ONE_MINUTE } from '../lib/queryClient';

/** Admin analytics, refreshed every minute while the dashboard is open. */
export function useAdminAnalytics(options: { enabled: boolean }) {
  return useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<AnalyticsData>('/admin/analytics', { signal });
      if (!response.data) throw new Error(response.error || 'Empty response');
      return response.data;
    },
    enabled: options.enabled,
    refetchInterval: ONE_MINUTE,
    staleTime: ONE_MINUTE,
  });
}
