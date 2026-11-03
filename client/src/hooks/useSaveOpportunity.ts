import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { Opportunity, SavedCategory, SavedOpportunity } from '../types';
import type { OpportunityPage } from './useOpportunities';
import { queryKeys } from './queryKeys';

interface SaveInput {
  opportunity: Opportunity;
  category: SavedCategory;
}

export interface SaveResult {
  /** The stored row: the input itself, or the row a live result was promoted to. */
  opportunity: Opportunity;
  category: SavedCategory;
  saved: SavedOpportunity | undefined;
}

function toSaveLivePayload(opportunity: Opportunity) {
  return {
    title: opportunity.title,
    organization: opportunity.organization,
    description: opportunity.description,
    location: opportunity.location,
    isRemote: opportunity.isRemote,
    eventDate: opportunity.eventDate,
    cfpDeadline: opportunity.cfpDeadline,
    deadlineTimezone: opportunity.deadlineTimezone ?? null,
    format: opportunity.format,
    industries: opportunity.industries,
    compensationType: opportunity.compensationType,
    compensationAmount: opportunity.compensationAmount,
    compensationDetails: opportunity.compensationDetails,
    qualityScore: opportunity.qualityScore,
    applyUrl: opportunity.applyUrl,
    liveSearchUrl: opportunity.liveSearchUrl,
  };
}

/**
 * Save an opportunity under a category. A live result is first persisted via
 * `save-live` (which returns the stored row) and then saved under that row's
 * id; every cached list that held the live item is updated to the stored row,
 * so cards and detail links switch to the permanent id.
 */
export function useSaveOpportunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ opportunity, category }: SaveInput): Promise<SaveResult> => {
      let target = opportunity;
      if (opportunity.isLiveResult) {
        const response = await apiClient.post<Opportunity>(
          '/opportunities/save-live',
          toSaveLivePayload(opportunity)
        );
        if (!response.data) throw new Error(response.error || 'Could not store live result');
        target = { ...response.data, isLiveResult: false, matchesLocationFilter: opportunity.matchesLocationFilter };
      }
      const saved = await apiClient.post<SavedOpportunity>('/saved', {
        opportunityId: target.id,
        category,
      });
      return { opportunity: target, category, saved: saved.data };
    },
    onSuccess: ({ opportunity }, { opportunity: original }) => {
      if (original.id !== opportunity.id) {
        queryClient.setQueriesData<OpportunityPage>({ queryKey: queryKeys.opportunities.all }, (page) =>
          page
            ? {
                ...page,
                items: page.items.map((item) => (item.id === original.id ? opportunity : item)),
              }
            : page
        );
      }
      queryClient.setQueryData(queryKeys.opportunities.detail(opportunity.id), opportunity);
      queryClient.invalidateQueries({ queryKey: queryKeys.saved.all });
    },
  });
}
