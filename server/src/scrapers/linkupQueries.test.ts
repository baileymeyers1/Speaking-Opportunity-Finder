import { describe, it, expect } from 'vitest';
import { OPPORTUNITY_FORMATS } from '../services/extraction.js';
import {
  FORMAT_CFP_QUERIES,
  INDUSTRY_CFP_QUERIES,
  LINKUP_QUERIES,
  LINKUP_QUERY_COUNT,
  promotedQueryFromSearch,
} from './linkupQueries.js';
import { selectLinkupQueries } from './linkupcfp.js';

const thisYear = new Date().getFullYear();

describe('Linkup query set', () => {
  it('labels every query with a known format and the industry set with conference', () => {
    for (const entry of LINKUP_QUERIES) expect(OPPORTUNITY_FORMATS).toContain(entry.format);
    for (const entry of INDUSTRY_CFP_QUERIES) expect(entry.format).toBe('conference');
    expect(LINKUP_QUERY_COUNT).toBe(INDUSTRY_CFP_QUERIES.length + FORMAT_CFP_QUERIES.length);
  });

  it('covers podcasts, meetups, webinars and panels', () => {
    const formats = new Set(FORMAT_CFP_QUERIES.map((entry) => entry.format));
    expect([...formats].sort()).toEqual(['meetup', 'panel', 'podcast', 'webinar']);
    expect(new Set(LINKUP_QUERIES.map((entry) => entry.query)).size).toBe(LINKUP_QUERIES.length);
  });

  it('uses the current year, never a hardcoded one', () => {
    for (const entry of LINKUP_QUERIES) {
      expect(entry.query).toContain(String(thisYear));
      expect(entry.query).not.toMatch(/\b20(1\d|2[0-5])\b/);
    }
  });
});

describe('selectLinkupQueries', () => {
  const all = LINKUP_QUERIES;

  it('takes a wrapping slice and appends extras', () => {
    const extra = { query: 'promoted', industries: [], format: 'conference' as const };
    const selected = selectLinkupQueries({ offset: all.length - 2, maxQueries: 4, extraQueries: [extra] }, all);
    expect(selected).toHaveLength(5);
    expect(selected.slice(0, 4)).toEqual([all[all.length - 2], all[all.length - 1], all[0], all[1]]);
    expect(selected[4]).toBe(extra);
  });

  it('defaults to the whole set', () => {
    expect(selectLinkupQueries({}, all)).toHaveLength(all.length);
  });
});

describe('promotedQueryFromSearch', () => {
  it('adds speaking words to a bare topic search', () => {
    const promoted = promotedQueryFromSearch('healthcare denver');
    expect(promoted.query).toBe(`healthcare denver call for speakers CFP ${thisYear} ${thisYear + 1}`);
    expect(promoted.format).toBe('conference');
  });

  it('keeps a search that already names a speaking format', () => {
    expect(promotedQueryFromSearch('fintech podcast guests').query).toBe(`fintech podcast guests ${thisYear} ${thisYear + 1}`);
  });
});
