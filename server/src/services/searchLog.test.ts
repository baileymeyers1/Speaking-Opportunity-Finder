import { describe, it, expect, vi } from 'vitest';
import { normalizeSearchQuery, promotedLinkupQueries, type QueryCount } from './searchLog.js';
import type { LinkupQuery } from '../scrapers/linkupQueries.js';

const now = new Date('2026-11-03T12:00:00Z');
const thisYear = now.getFullYear();

const staticQueries: LinkupQuery[] = [
  { query: `healthcare medical conference call for speakers CFP USA United States ${thisYear} ${thisYear + 1}`, industries: ['healthcare'], format: 'conference' },
];

function fetcher(rows: QueryCount[]) {
  return vi.fn(async () => rows);
}

describe('normalizeSearchQuery', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeSearchQuery('  Healthcare,   Denver!! ')).toBe('healthcare denver');
    expect(normalizeSearchQuery('AI/ML "call for speakers"')).toBe('ai ml call for speakers');
    expect(normalizeSearchQuery('')).toBe('');
  });

  it('keeps letters from any script and caps the length', () => {
    expect(normalizeSearchQuery('Zürich Datenschutz')).toBe('zürich datenschutz');
    expect(normalizeSearchQuery('x'.repeat(500))).toHaveLength(200);
  });
});

describe('promotedLinkupQueries', () => {
  it('promotes the most frequent recent queries, most frequent first', async () => {
    const fetch = fetcher([
      { query: 'fintech denver', count: 9 },
      { query: 'devops kubernetes', count: 4 },
      { query: 'climate policy', count: 3 },
    ]);
    const promoted = await promotedLinkupQueries(2, now, fetch, staticQueries);
    expect(promoted.map((entry) => entry.query)).toEqual([
      `fintech denver call for speakers CFP ${thisYear} ${thisYear + 1}`,
      `devops kubernetes call for speakers CFP ${thisYear} ${thisYear + 1}`,
    ]);
    expect(promoted.every((entry) => entry.format === 'conference')).toBe(true);
  });

  it('asks for the last 30 days', async () => {
    const fetch = fetcher([]);
    await promotedLinkupQueries(2, now, fetch, staticQueries);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [since, take] = fetch.mock.calls[0] as unknown as [Date, number];
    expect(since.toISOString()).toBe('2026-10-04T12:00:00.000Z');
    expect(take).toBeGreaterThanOrEqual(2);
  });

  it('skips one-off searches, short queries and queries the static set already covers', async () => {
    const fetch = fetcher([
      { query: 'healthcare medical conference call for speakers cfp usa united states ' + `${thisYear} ${thisYear + 1}`, count: 12 },
      { query: 'ai', count: 8 },
      { query: 'quantum computing', count: 1 },
      { query: 'biotech boston', count: 2 },
    ]);
    const promoted = await promotedLinkupQueries(2, now, fetch, staticQueries);
    expect(promoted.map((entry) => entry.query)).toEqual([`biotech boston call for speakers CFP ${thisYear} ${thisYear + 1}`]);
  });

  it('returns nothing when the log is empty, the limit is zero or the read fails', async () => {
    expect(await promotedLinkupQueries(2, now, fetcher([]), staticQueries)).toEqual([]);
    const fetch = fetcher([{ query: 'fintech', count: 5 }]);
    expect(await promotedLinkupQueries(0, now, fetch, staticQueries)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    const failing = vi.fn(async () => { throw new Error('db down'); });
    expect(await promotedLinkupQueries(2, now, failing, staticQueries)).toEqual([]);
  });
});
