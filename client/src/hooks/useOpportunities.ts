import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { filtersToApiQuery, type BrowseFilters } from '../filters/serialize';
import type { Opportunity, PaginatedResponse } from '../types';
import { ONE_MINUTE } from '../lib/queryClient';
import { queryKeys } from './queryKeys';

export type OpportunityPage = PaginatedResponse<Opportunity>;

export async function fetchOpportunityPage(
  filters: BrowseFilters,
  options: { liveSearch?: boolean; signal?: AbortSignal; speakerId?: string } = {}
): Promise<OpportunityPage> {
  const query = filtersToApiQuery(filters, { liveSearch: options.liveSearch });
  if (options.speakerId) query.set('speaker', options.speakerId);
  const response = await apiClient.get<OpportunityPage>(`/opportunities?${query.toString()}`, {
    signal: options.signal,
  });
  if (!response.data) throw new Error(response.error || 'Empty response');
  return response.data;
}

/** A page a live search answered: only those carry the live search's summary (`pendingLiveHits`). */
export function isLiveSearchPage(page: OpportunityPage | undefined): boolean {
  return page?.pendingLiveHits !== undefined;
}

/** How long a list is fresh. A live search's list stays until a new search replaces it. */
export function listStaleTime(page: OpportunityPage | undefined): number {
  // Refetching it would bring back the stored list without what the search surfaced, so it
  // is never refetched on its own; "Clear live results" refetches on purpose.
  return isLiveSearchPage(page) ? Infinity : 5 * ONE_MINUTE;
}

/**
 * The list for one URL. The key is the serialized filters, so the same URL
 * always maps to the same cache entry (back navigation restores it) and any
 * filter change is a new key (an in-flight request for the old key is
 * cancelled through the signal, so it can never land on the new list).
 *
 * `speakerId` is the speaker whose fit the rows lead with (and "best match"
 * sorts by); without one, each row leads with whoever on the roster fits best.
 */
export function useOpportunities(filters: BrowseFilters, speakerId?: string) {
  return useQuery({
    queryKey: queryKeys.opportunities.list(filters, speakerId),
    queryFn: ({ signal }) => fetchOpportunityPage(filters, { signal, speakerId }),
    placeholderData: keepPreviousData,
    staleTime: (query) => listStaleTime(query.state.data),
    meta: { persist: true },
  });
}
