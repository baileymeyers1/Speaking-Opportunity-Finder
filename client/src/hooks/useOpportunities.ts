import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { filtersToApiQuery, type BrowseFilters } from '../filters/serialize';
import type { Opportunity, PaginatedResponse } from '../types';
import { ONE_MINUTE } from '../lib/queryClient';
import { queryKeys } from './queryKeys';

export type OpportunityPage = PaginatedResponse<Opportunity>;

export async function fetchOpportunityPage(
  filters: BrowseFilters,
  options: { liveSearch?: boolean; signal?: AbortSignal } = {}
): Promise<OpportunityPage> {
  const query = filtersToApiQuery(filters, { liveSearch: options.liveSearch });
  const response = await apiClient.get<OpportunityPage>(`/opportunities?${query.toString()}`, {
    signal: options.signal,
  });
  if (!response.data) throw new Error(response.error || 'Empty response');
  return response.data;
}

/**
 * The list for one URL. The key is the serialized filters, so the same URL
 * always maps to the same cache entry (back navigation restores it) and any
 * filter change is a new key (an in-flight request for the old key is
 * cancelled through the signal, so it can never land on the new list).
 */
export function useOpportunities(filters: BrowseFilters) {
  return useQuery({
    queryKey: queryKeys.opportunities.list(filters),
    queryFn: ({ signal }) => fetchOpportunityPage(filters, { signal }),
    placeholderData: keepPreviousData,
    // Long enough that a live search result survives a round trip to a detail page.
    staleTime: 5 * ONE_MINUTE,
    meta: { persist: true },
  });
}
