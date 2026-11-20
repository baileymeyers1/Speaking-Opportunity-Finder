import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { SpeakerProfile, SpeakerProfileInput } from '../types';
import { queryKeys } from './queryKeys';

/**
 * The account's roster, oldest first, in one query: the list page, a
 * speaker's own page and Browse (whose fit is the first speaker's) all read
 * it. Never persisted to localStorage: it is per-account data.
 */
export function useSpeakers(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.speakers,
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<SpeakerProfile[]>('/speakers', { signal });
      return response.data ?? [];
    },
    enabled: options.enabled ?? true,
  });
}

/** Fit on every call depends on the roster, so every cached list and call is refetched after a change. */
function rosterChanged(queryClient: QueryClient, update: (speakers: SpeakerProfile[]) => SpeakerProfile[]) {
  queryClient.setQueryData<SpeakerProfile[]>(queryKeys.speakers, (speakers) => update(speakers ?? []));
  queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
  queryClient.invalidateQueries({ queryKey: ['opportunity'] });
}

export function useCreateSpeaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SpeakerProfileInput) => {
      const response = await apiClient.post<SpeakerProfile>('/speakers', input);
      if (!response.data) throw new Error(response.error || 'Could not add the speaker');
      return response.data;
    },
    onSuccess: (speaker) => rosterChanged(queryClient, (speakers) => [...speakers, speaker]),
  });
}

export function useUpdateSpeaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SpeakerProfileInput }) => {
      const response = await apiClient.put<SpeakerProfile>(`/speakers/${id}`, input);
      if (!response.data) throw new Error(response.error || 'Could not save the speaker');
      return response.data;
    },
    onSuccess: (speaker) =>
      rosterChanged(queryClient, (speakers) => speakers.map((item) => (item.id === speaker.id ? speaker : item))),
  });
}

export function useRemoveSpeaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/speakers/${id}`);
      return id;
    },
    onSuccess: (id) => {
      rosterChanged(queryClient, (speakers) => speakers.filter((item) => item.id !== id));
      // Calls saved for the speaker went with them.
      queryClient.invalidateQueries({ queryKey: queryKeys.saved.all });
    },
  });
}
