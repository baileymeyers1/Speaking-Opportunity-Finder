import { serializeFilters, type BrowseFilters } from '../filters/serialize';

/** Every query key in the app, so invalidation never guesses at strings. */
export const queryKeys = {
  opportunities: {
    all: ['opportunities'] as const,
    list: (filters: BrowseFilters) => ['opportunities', serializeFilters(filters)] as const,
    detail: (id: string) => ['opportunity', id] as const,
  },
  liveSearch: (filters: BrowseFilters) => ['liveSearch', serializeFilters(filters)] as const,
  filterOptions: ['filterOptions'] as const,
  saved: {
    all: ['saved'] as const,
  },
};
