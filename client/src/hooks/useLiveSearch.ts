import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { serializeFilters, type BrowseFilters } from '../filters/serialize';
import { fetchOpportunityPage } from './useOpportunities';
import { queryKeys } from './queryKeys';

const LIVE_SEARCH_KEY = ['liveSearch'] as const;

function firstPage(filters: BrowseFilters): BrowseFilters {
  return { ...filters, page: 1 };
}

/**
 * Live search is a mutation: it is expensive, user-initiated and must never run
 * on its own. Its result is the complete list for the same filters (the server
 * merges live hits with the stored rows), so on success it replaces the list
 * cache entry for that key. Any DB fetch still in flight for that key is
 * cancelled first so it cannot overwrite the live results afterwards.
 *
 * `isSearching` is derived from the mutation cache, keyed by the filters being
 * searched, so it survives leaving and returning to the page mid-search and is
 * true only when the search in flight is for the filters now in the URL.
 */
export function useLiveSearch(filters: BrowseFilters) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: LIVE_SEARCH_KEY,
    mutationFn: async (searchFilters: BrowseFilters) => {
      const target = firstPage(searchFilters);
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.list(target) });
      return fetchOpportunityPage(target, { liveSearch: true });
    },
    onSuccess: (page, searchFilters) => {
      queryClient.setQueryData(queryKeys.opportunities.list(firstPage(searchFilters)), page);
    },
  });

  const pendingSearches = useMutationState({
    filters: { mutationKey: LIVE_SEARCH_KEY, status: 'pending' },
    select: (pending) => serializeFilters(firstPage(pending.state.variables as BrowseFilters)),
  });
  const isSearching = pendingSearches.includes(serializeFilters(firstPage(filters)));

  return {
    run: (searchFilters: BrowseFilters) => mutation.mutate(firstPage(searchFilters)),
    isSearching,
    error: mutation.error,
    reset: mutation.reset,
  };
}
