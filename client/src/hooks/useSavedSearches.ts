import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { SavedSearch } from '../types';

const SAVED_SEARCHES_KEY = ['savedSearches'] as const;

export function useSavedSearches(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SAVED_SEARCHES_KEY,
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<SavedSearch[]>('/saved-searches', { signal });
      return response.data ?? [];
    },
    enabled: options.enabled ?? true,
  });
}

export function useSaveSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; query: string | null; filters: Record<string, unknown> }) =>
      apiClient.post<SavedSearch>('/saved-searches', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_SEARCHES_KEY }),
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/saved-searches/${id}`);
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<SavedSearch[]>(SAVED_SEARCHES_KEY, (items) =>
        items?.filter((search) => search.id !== id)
      );
    },
  });
}
