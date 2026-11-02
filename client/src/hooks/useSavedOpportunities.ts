import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { SavedCategory, SavedOpportunity } from '../types';
import { queryKeys } from './queryKeys';

/**
 * All of the user's saved opportunities in one query. Tabs filter client-side,
 * so every tab's count is right regardless of which tab is open.
 */
export function useSavedOpportunities(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.saved.all,
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<SavedOpportunity[]>('/saved', { signal });
      return response.data ?? [];
    },
    enabled: options.enabled ?? true,
  });
}

export function useRemoveSavedOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (savedId: string) => {
      await apiClient.delete(`/saved/${savedId}`);
      return savedId;
    },
    onSuccess: (savedId) => {
      queryClient.setQueryData<SavedOpportunity[]>(queryKeys.saved.all, (items) =>
        items?.filter((item) => item.id !== savedId)
      );
    },
  });
}

export function useUpdateSavedCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { savedId: string; category: SavedCategory }) => {
      await apiClient.patch(`/saved/${input.savedId}`, { category: input.category });
      return input;
    },
    onSuccess: ({ savedId, category }) => {
      queryClient.setQueryData<SavedOpportunity[]>(queryKeys.saved.all, (items) =>
        items?.map((item) => (item.id === savedId ? { ...item, category } : item))
      );
    },
  });
}
