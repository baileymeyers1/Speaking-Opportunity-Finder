import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { SpeakerProfile, SpeakerProfileInput } from '../types';
import { queryKeys } from './queryKeys';

/**
 * The signed-in user's speaker profile, or `null` before one is saved.
 * Never persisted to localStorage: it is per-user data.
 */
export function useProfile(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<SpeakerProfile | null>('/profile', { signal });
      return response.data ?? null;
    },
    enabled: options.enabled ?? true,
  });
}

/** Saves the whole profile. Match scores depend on it, so every cached list is refetched. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SpeakerProfileInput) => {
      const response = await apiClient.put<SpeakerProfile>('/profile', input);
      if (!response.data) throw new Error(response.error || 'Could not save the profile');
      return response.data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: ['opportunity'] });
    },
  });
}
