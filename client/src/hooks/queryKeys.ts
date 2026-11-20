import { serializeFilters, type BrowseFilters } from '../filters/serialize';

/** Every query key in the app, so invalidation never guesses at strings. */
export const queryKeys = {
  opportunities: {
    all: ['opportunities'] as const,
    /** `speakerId`: whose fit the rows lead with; everyone's best fit when absent. A different list, so a different key. */
    list: (filters: BrowseFilters, speakerId?: string) =>
      ['opportunities', serializeFilters(filters), speakerId ?? 'everyone'] as const,
    detail: (id: string) => ['opportunity', id] as const,
  },
  liveSearch: (filters: BrowseFilters) => ['liveSearch', serializeFilters(filters)] as const,
  filterOptions: ['filterOptions'] as const,
  saved: {
    all: ['saved'] as const,
  },
  speakers: ['speakers'] as const,
};
