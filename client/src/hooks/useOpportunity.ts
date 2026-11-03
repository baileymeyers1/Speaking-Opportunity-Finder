import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { Opportunity } from '../types';
import type { OpportunityPage } from './useOpportunities';
import { queryKeys } from './queryKeys';

export const LIVE_ID_PREFIX = 'live-';

export class LiveResultExpiredError extends Error {
  constructor() {
    super('This live search result is no longer cached. Please search again to find it.');
    this.name = 'LiveResultExpiredError';
  }
}

/**
 * One opportunity by id. Live results only exist in the lists that produced
 * them, so they are looked up in the cached list pages (which are persisted
 * across reloads) instead of the API.
 */
export function useOpportunity(id: string | undefined) {
  const queryClient = useQueryClient();

  const findInLists = (): { item: Opportunity; updatedAt: number } | undefined => {
    if (!id) return undefined;
    for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.opportunities.all })) {
      const page = query.state.data as OpportunityPage | undefined;
      const match = page?.items.find((item) => item.id === id);
      if (match) return { item: match, updatedAt: query.state.dataUpdatedAt };
    }
    return undefined;
  };

  return useQuery({
    queryKey: queryKeys.opportunities.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      if (!id) throw new Error('Missing id');
      if (id.startsWith(LIVE_ID_PREFIX)) {
        const cached = findInLists();
        if (!cached) throw new LiveResultExpiredError();
        return cached.item;
      }
      const response = await apiClient.get<Opportunity>(`/opportunities/${id}`, { signal });
      if (!response.data) throw new Error(response.error || 'Opportunity not found');
      return response.data;
    },
    // Seed from the list that linked here so the page renders at once; the
    // list's own timestamp decides whether a background refetch is due.
    initialData: () => findInLists()?.item,
    initialDataUpdatedAt: () => findInLists()?.updatedAt,
    retry: (failureCount, error) => !(error instanceof LiveResultExpiredError) && failureCount < 1,
  });
}
