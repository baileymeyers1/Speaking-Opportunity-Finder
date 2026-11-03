import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { FilterOptions } from '../types';
import { ONE_HOUR } from '../lib/queryClient';
import { queryKeys } from './queryKeys';

export function useFilterOptions() {
  return useQuery({
    queryKey: queryKeys.filterOptions,
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<FilterOptions>('/opportunities/filters', { signal });
      if (!response.data) throw new Error(response.error || 'Empty response');
      return response.data;
    },
    staleTime: ONE_HOUR,
    meta: { persist: true },
  });
}
