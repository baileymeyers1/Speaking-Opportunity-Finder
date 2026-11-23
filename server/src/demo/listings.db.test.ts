import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { LIVE_SEARCH_SOURCE } from '../services/searchSources.js';
import { fetchPublicListings, LISTINGS_REFRESH_KEY, refreshDemoListings, toOpportunityRow, type PublicListing } from './listings.js';

/** Against the test Postgres: the demo's copy of production's public list. */
const STAMP = Date.now();
const made: string[] = [];
/** The test database is shared with other suites: a removal here may only touch this file's rows. */
const removalScope = { applyUrl: { startsWith: `https://copy-test.example/${STAMP}` } };

function listing(overrides: Partial<PublicListing> = {}): PublicListing {
  const id = randomUUID();
  made.push(id);
  return {
    id,
    title: `Demo copy test ${STAMP}`,
    organization: 'Copy Test Org',
    description: 'A call for speakers.',
    location: null,
    isRemote: true,
    eventDate: '2099-06-01T00:00:00.000Z',
    cfpDeadline: '2099-05-01T00:00:00.000Z',
    format: 'conference',
    industries: ['health', 'policy'],
    sectors: ['healthcare'],
    applyUrl: `https://copy-test.example/${STAMP}/${id}`,
    qualityScore: 80,
    source: 'sessionize.com',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    enrichmentStatus: 'enriched',
    enrichmentAttempts: 1,
    isClosed: false,
    isRelevant: true,
    hasOpenCall: true,
    verifiedAt: '2026-11-02T00:00:00.000Z',
    dateConfidence: { eventDate: 'high' },
    eventId: randomUUID(),
    editionYear: 2099,
    alsoListedOn: [],
    previousEditions: [],
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { id: { in: made } } });
  await prisma.opportunity.deleteMany({ where: { applyUrl: { startsWith: `https://copy-test.example/${STAMP}` } } });
  await prisma.enrichmentUsage.deleteMany({ where: { date: LISTINGS_REFRESH_KEY } });
});

describe('toOpportunityRow', () => {
  it('turns the API row back into columns: dates, JSON text, no event links', () => {
    const row = toOpportunityRow(listing());
    expect(row.cfpDeadline).toEqual(new Date('2099-05-01T00:00:00.000Z'));
    expect(row.industries).toBe('["health","policy"]');
    expect(row.dateConfidence).toBe('{"eventDate":"high"}');
    expect(row.eventId).toBeNull();
    expect(row).not.toHaveProperty('alsoListedOn');
  });
});

describe('fetchPublicListings', () => {
  it('reads every page and refuses an unexpected answer', async () => {
    const pages = [[listing(), listing()], [listing()]];
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      const page = Number(new URL(url).searchParams.get('page'));
      return { ok: true, status: 200, json: async () => ({ success: true, data: { items: pages[page - 1] ?? [], total: 3 } }) };
    };
    expect(await fetchPublicListings('https://prod.example', fetchImpl)).toHaveLength(3);
    expect(urls[0]).toBe('https://prod.example/api/opportunities?pageSize=1000&page=1');

    const broken = async () => ({ ok: true, status: 200, json: async () => ({ error: 'nope' }) });
    await expect(fetchPublicListings('https://prod.example', broken)).rejects.toThrow('unexpected shape');
    const down = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(fetchPublicListings('https://prod.example', down)).rejects.toThrow('503');
  });
});

describe('refreshDemoListings', () => {
  it('adds new calls, updates known ones, removes what production dropped, and keeps recent demo hits', async () => {
    const kept = listing();
    const dropped = listing();
    await refreshDemoListings(prisma, { listings: [kept, dropped], removalScope });

    const recentHit = await prisma.opportunity.create({
      data: {
        title: 'Demo live hit',
        organization: 'Hit Org',
        format: 'conference',
        sectors: [],
        applyUrl: `https://copy-test.example/${STAMP}/hit`,
        source: LIVE_SEARCH_SOURCE,
      },
    });
    made.push(recentHit.id);

    const added = listing();
    const result = await refreshDemoListings(prisma, { listings: [{ ...kept, title: 'Renamed upstream' }, added], removalScope });

    expect(result).toMatchObject({ listed: 2, created: 1, updated: 1 });
    expect((await prisma.opportunity.findUnique({ where: { id: kept.id } }))?.title).toBe('Renamed upstream');
    expect(await prisma.opportunity.findUnique({ where: { id: added.id } })).not.toBeNull();
    expect(await prisma.opportunity.findUnique({ where: { id: dropped.id } })).toBeNull();
    expect(await prisma.opportunity.findUnique({ where: { id: recentHit.id } })).not.toBeNull();
    expect((await prisma.enrichmentUsage.findUnique({ where: { date: LISTINGS_REFRESH_KEY } }))?.count).toBe(2);
  });

  it('refuses an empty list instead of wiping the copy', async () => {
    await expect(refreshDemoListings(prisma, { listings: [], removalScope })).rejects.toThrow('no calls');
  });
});
