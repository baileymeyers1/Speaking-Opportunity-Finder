import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

export const ONE_MINUTE = 60 * 1000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;

/** Bump when the shape of persisted responses changes so stale caches are dropped. */
const CACHE_BUSTER = 'v2';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: ONE_MINUTE,
      // Keep lists around long enough to restore on the next cold start.
      gcTime: ONE_DAY,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function createPersister() {
  try {
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: 'speaking-finder-query-cache',
      throttleTime: 1000,
    });
  } catch {
    return undefined;
  }
}

const persister = typeof window !== 'undefined' ? createPersister() : undefined;

/**
 * Only queries that opt in via `meta.persist` are written to localStorage:
 * public lists and filter options, never per-user data. Successful results
 * only, so an error never gets restored as data.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> | undefined = persister
  ? {
      persister,
      maxAge: ONE_DAY,
      buster: CACHE_BUSTER,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) =>
          query.state.status === 'success' && query.meta?.persist === true,
      },
    }
  : undefined;

/** Storage keys written by the hand-rolled caches this client replaced. */
const LEGACY_STORAGE_KEYS = ['cachedOpportunities', 'liveResultsCache', 'filter_options_cache'];
const LEGACY_SESSION_KEYS = ['liveSearchCache'];

export function removeLegacyCaches(): void {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    LEGACY_SESSION_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage may be unavailable; nothing to clean up then.
  }
}
