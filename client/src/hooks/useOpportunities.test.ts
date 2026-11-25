import { describe, expect, it } from 'vitest';
import { isLiveSearchPage, listStaleTime, type OpportunityPage } from './useOpportunities';

function page(overrides: Partial<OpportunityPage> = {}): OpportunityPage {
  return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0, liveResultCount: 0, ...overrides };
}

describe('isLiveSearchPage', () => {
  it('is a page a live search answered, even one that surfaced nothing', () => {
    expect(isLiveSearchPage(page({ pendingLiveHits: [] }))).toBe(true);
    expect(isLiveSearchPage(page({ pendingLiveHits: [], liveResultCount: 3 }))).toBe(true);
  });

  it('is not the stored list, or a list not loaded yet', () => {
    expect(isLiveSearchPage(page())).toBe(false);
    expect(isLiveSearchPage(undefined)).toBe(false);
  });
});

describe('listStaleTime', () => {
  it('keeps a live search list until a new search replaces it', () => {
    expect(listStaleTime(page({ pendingLiveHits: [] }))).toBe(Infinity);
  });

  it('refreshes the stored list after five minutes', () => {
    expect(listStaleTime(page())).toBe(5 * 60 * 1000);
    expect(listStaleTime(undefined)).toBe(5 * 60 * 1000);
  });
});
