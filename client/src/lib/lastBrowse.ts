/**
 * Where Browse was left: its last query string (search, sectors, filters, lane
 * and page). Browse writes it whenever its URL changes and every way back to
 * Browse reads it, so a search outlives a visit to another tab until a new
 * search (or "Clear all") replaces it.
 *
 * It lasts for this tab's visit (sessionStorage, which survives a reload). The
 * URL is still the source of truth: an address typed or a link followed shows
 * what it says, and Browse then remembers that instead.
 */
const STORAGE_KEY = 'speaking-finder:browse-search';
const CHANGED = 'speaking-finder:browse-search-changed';

let memory: string | null = null;

function normalize(search: string): string {
  return search.startsWith('?') ? search.slice(1) : search;
}

/** The remembered query string, without the leading `?`; empty when Browse was left bare. */
export function readBrowseSearch(): string {
  if (memory === null) {
    try {
      memory = window.sessionStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      // Private windows and blocked site data: remembered for the page only.
      memory = '';
    }
  }
  return memory;
}

export function rememberBrowseSearch(search: string): void {
  const next = normalize(search);
  if (next === readBrowseSearch()) return;
  memory = next;
  try {
    if (next) window.sessionStorage.setItem(STORAGE_KEY, next);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Kept in memory above.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** The address of Browse with a query string. */
export function browsePath(search: string): string {
  const query = normalize(search);
  return query ? `/?${query}` : '/';
}

export function subscribeToBrowseSearch(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}
