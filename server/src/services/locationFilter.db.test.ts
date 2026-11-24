import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { buildFilters } from '../controllers/opportunityFilters.js';
import { getOpportunities } from './opportunityService.js';

/**
 * Against the test Postgres database: the location filter's SQL finds the same
 * rows as `locationMatches` in memory, includes calls held online after the
 * ones in the place, and flags each row it returns.
 *
 * Every row here is stored as enriched. An unread row (`enrichmentStatus`
 * null, no claim) in the shared test database is claimable by the worker
 * tests in enrichmentBudget.db.test.ts, which run alongside.
 */
const SEARCH = 'Placeprobe';
const now = new Date('2026-11-24T12:00:00Z');
const url = (slug: string) => `https://location-filter.example/${slug}`;

const ROWS: { slug: string; location: string | null; isRemote?: boolean; days: number }[] = [
  { slug: 'long-beach', location: 'Long Beach, CA', days: 40 },
  { slug: 'los-angeles-usa', location: 'Los Angeles, CA, USA', days: 30 },
  { slug: 'sacramento', location: 'Sacramento, California', days: 20 },
  { slug: 'san-diego-bare', location: 'San Diego', days: 50 },
  { slug: 'toronto', location: 'Toronto, Canada', days: 10 },
  { slug: 'chicago', location: 'Chicago, IL', days: 11 },
  { slug: 'costa-rica', location: 'San José, Costa Rica', days: 12 },
  { slug: 'online', location: null, isRemote: true, days: 5 },
  { slug: 'nowhere', location: null, days: 6 },
];

beforeAll(async () => {
  await prisma.opportunity.deleteMany({ where: { applyUrl: { startsWith: url('') } } });
  await prisma.opportunity.createMany({
    data: ROWS.map((row) => ({
      title: `${SEARCH} ${row.slug}`,
      organization: 'Location Test Org',
      applyUrl: url(row.slug),
      format: 'conference',
      source: 'test-location-filter',
      location: row.location,
      isRemote: row.isRemote ?? false,
      cfpDeadline: new Date(now.getTime() + row.days * 24 * 60 * 60 * 1000),
      qualityScore: 50,
      industries: '[]',
      enrichmentStatus: 'enriched',
      verifiedAt: now,
    })),
  });
});

afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { applyUrl: { startsWith: url('') } } });
});

async function list(query: Record<string, string>) {
  const filters = buildFilters({ search: SEARCH, ...query });
  const page = await getOpportunities(filters, { pageSize: 50 }, { now });
  return page.items.map((item) => ({ slug: item.title.replace(`${SEARCH} `, ''), inPlace: item.matchesLocationFilter }));
}

describe('location filter (db)', () => {
  it.each(['California', 'california', 'CA'])('%s finds every California row, then the online one, and nothing in Canada', async (place) => {
    const rows = await list({ locations: place });
    const slugs = rows.map((row) => row.slug);
    expect(slugs.slice(0, 4).sort()).toEqual(['long-beach', 'los-angeles-usa', 'sacramento', 'san-diego-bare']);
    expect(slugs.slice(4)).toEqual(['online']);
    expect(rows.filter((row) => row.inPlace).length).toBe(4);
    expect(rows.find((row) => row.slug === 'online')?.inPlace).toBe(false);
  });

  it('keeps the default order inside each group', async () => {
    const filters = buildFilters({ locations: 'CA' });
    const page = await getOpportunities({ ...filters, search: undefined }, { pageSize: 500 }, { now });
    const ours = page.items.filter((item) => item.applyUrl.startsWith(url(''))).map((item) => item.title.replace(`${SEARCH} `, ''));
    expect(ours).toEqual(['sacramento', 'los-angeles-usa', 'long-beach', 'san-diego-bare', 'online']);
  });

  it('lists every row without a location filter, unflagged', async () => {
    const rows = await list({});
    expect(rows).toHaveLength(ROWS.length);
    expect(rows.every((row) => row.inPlace === undefined)).toBe(true);
  });
});
