import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'speaking-finder:browse-search';

// The module keeps what it read in memory, so each test starts from a fresh copy.
async function load() {
  vi.resetModules();
  return import('./lastBrowse');
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('browsePath', () => {
  it('is the bare address when Browse was left without a search', async () => {
    const { browsePath } = await load();
    expect(browsePath('')).toBe('/');
  });

  it('carries the query string, with or without its question mark', async () => {
    const { browsePath } = await load();
    expect(browsePath('q=ai&lane=open')).toBe('/?q=ai&lane=open');
    expect(browsePath('?q=ai')).toBe('/?q=ai');
  });
});

describe('remembering where Browse was left', () => {
  it('starts empty', async () => {
    const { readBrowseSearch } = await load();
    expect(readBrowseSearch()).toBe('');
  });

  it('returns the last search until a new one replaces it', async () => {
    const { readBrowseSearch, rememberBrowseSearch } = await load();
    rememberBrowseSearch('q=ai');
    expect(readBrowseSearch()).toBe('q=ai');
    rememberBrowseSearch('?q=healthcare&sectors=healthcare');
    expect(readBrowseSearch()).toBe('q=healthcare&sectors=healthcare');
  });

  it('forgets the search once Browse is left bare ("Clear all")', async () => {
    const { readBrowseSearch, rememberBrowseSearch } = await load();
    rememberBrowseSearch('q=ai');
    rememberBrowseSearch('');
    expect(readBrowseSearch()).toBe('');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('survives a reload in the same tab', async () => {
    const first = await load();
    first.rememberBrowseSearch('q=ai&page=2');
    const afterReload = await load();
    expect(afterReload.readBrowseSearch()).toBe('q=ai&page=2');
  });

  it('tells subscribers only when the search changes', async () => {
    const { rememberBrowseSearch, subscribeToBrowseSearch } = await load();
    const onChange = vi.fn();
    const unsubscribe = subscribeToBrowseSearch(onChange);
    rememberBrowseSearch('q=ai');
    rememberBrowseSearch('?q=ai');
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    rememberBrowseSearch('q=other');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('still remembers for the page when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { readBrowseSearch, rememberBrowseSearch } = await load();
    expect(readBrowseSearch()).toBe('');
    rememberBrowseSearch('q=ai');
    expect(readBrowseSearch()).toBe('q=ai');
  });
});
