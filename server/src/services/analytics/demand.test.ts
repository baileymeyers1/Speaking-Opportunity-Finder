import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({ prisma: {} }));

import { summarizeSavedSearches, type SavedSearchRow } from './demand.js';
import { countJsonArrayValues, topCounts } from './shared.js';

const NOW = new Date('2026-11-03T12:00:00Z');

function saved(overrides: Partial<SavedSearchRow> & { filters?: string }): SavedSearchRow {
  return {
    userId: 'u1',
    query: null,
    filters: '{}',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

describe('summarizeSavedSearches', () => {
  it('counts users, recent saves, queries and the most common filters', () => {
    const rows = [
      saved({ query: 'Kubernetes', filters: JSON.stringify({ industries: ['technology', 'devops'], isRemote: true }) }),
      saved({ userId: 'u2', query: 'kubernetes ', filters: JSON.stringify({ industries: ['technology'], locations: ['Denver, CO'], format: ['conference'] }), createdAt: new Date('2026-11-02T00:00:00Z') }),
      saved({ userId: 'u2', filters: JSON.stringify({ industries: ['healthcare'], format: ['podcast', 'conference'] }) }),
      saved({ userId: 'u3', filters: 'not json' }),
    ];
    const summary = summarizeSavedSearches(rows, NOW);
    expect(summary).toMatchObject({ total: 4, users: 3, createdLast7d: 1, withQuery: 2, remoteOnly: 1 });
    expect(summary.topQueries).toEqual([{ label: 'kubernetes', count: 2 }]);
    expect(summary.topIndustries).toEqual([
      { label: 'technology', count: 2 },
      { label: 'devops', count: 1 },
      { label: 'healthcare', count: 1 },
    ]);
    expect(summary.topLocations).toEqual([{ label: 'Denver, CO', count: 1 }]);
    expect(summary.topFormats).toEqual([
      { label: 'conference', count: 2 },
      { label: 'podcast', count: 1 },
    ]);
  });

  it('is empty-safe', () => {
    expect(summarizeSavedSearches([], NOW)).toEqual({
      total: 0,
      users: 0,
      createdLast7d: 0,
      withQuery: 0,
      remoteOnly: 0,
      topQueries: [],
      topIndustries: [],
      topLocations: [],
      topFormats: [],
    });
  });
});

describe('countJsonArrayValues', () => {
  it('counts across encoded arrays, skipping bad JSON and non-strings, and caps the list', () => {
    const encoded = ['["a","b"]', '["a"]', 'nope', '{"x":1}', '["b","c",3,""]'];
    expect(countJsonArrayValues(encoded, 2)).toEqual([
      { label: 'a', count: 2 },
      { label: 'b', count: 2 },
    ]);
  });
});

describe('topCounts', () => {
  it('orders by count then label', () => {
    const counts = new Map([
      ['zeta', 2],
      ['alpha', 2],
      ['mid', 5],
    ]);
    expect(topCounts(counts, 10).map((c) => c.label)).toEqual(['mid', 'alpha', 'zeta']);
  });
});
