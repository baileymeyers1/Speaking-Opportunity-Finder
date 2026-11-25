import { useSyncExternalStore } from 'react';
import { browsePath, readBrowseSearch, subscribeToBrowseSearch } from '../lib/lastBrowse';

/**
 * The address to send someone back to Browse: the search they left it on.
 * Every link and redirect to Browse uses this instead of a bare `/`, which
 * would drop the search.
 */
export function useBrowsePath(): string {
  return useSyncExternalStore(subscribeToBrowseSearch, () => browsePath(readBrowseSearch()), () => '/');
}
