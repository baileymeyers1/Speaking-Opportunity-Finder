import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { getOpportunities } from './opportunityService.js';

/**
 * Against the test Postgres database: the list is paged one lane at a time,
 * and every response counts all three lanes under the other filters.
 */
const MARKER = 'lane test row';
const PLACE = 'Laneville';
const now = new Date('2026-11-20T12:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

interface RowDates {
  cfpDeadline?: Date;
  eventDate?: Date;
  hasOpenCall?: boolean | null;
  format?: string;
  qualityScore?: number;
}

async function store(title: string, row: RowDates = {}) {
  return prisma.opportunity.create({
    data: {
      title,
      organization: 'Lane Test Org',
      applyUrl: `https://lanes.example/${title.toLowerCase().replace(/\s+/g, '-')}`,
      format: row.format ?? 'conference',
      source: 'test-lanes',
      cfpDeadline: row.cfpDeadline ?? null,
      eventDate: row.eventDate ?? null,
      hasOpenCall: row.hasOpenCall === undefined ? true : row.hasOpenCall,
      location: `${PLACE}, ZZ`,
      qualityScore: row.qualityScore ?? 50,
      description: MARKER,
      // Read already, so the enrichment-budget tests running alongside never claim these.
      enrichmentStatus: 'enriched',
    },
  });
}

const reset = () => prisma.opportunity.deleteMany({ where: { description: MARKER } });
const titles = (items: Array<{ title: string }>) => items.map((item) => item.title);
const list = (filters: Parameters<typeof getOpportunities>[0], pageSize = 20, page = 1) =>
  getOpportunities({ location: PLACE, ...filters }, { page, pageSize }, { now });

describe('lanes', () => {
  beforeAll(async () => {
    await reset();
    await store('Closing Later', { cfpDeadline: inDays(40), hasOpenCall: null });
    await store('Rolling Low', { qualityScore: 40 });
    await store('Watch With Deadline', { hasOpenCall: false, cfpDeadline: inDays(2), eventDate: inDays(70) });
    await store('Open Until Event', { eventDate: inDays(20) });
    await store('Closing Soon', { cfpDeadline: inDays(3), eventDate: inDays(90) });
    await store('Rolling Podcast', { format: 'podcast', qualityScore: 60 });
    await store('Watch Early', { hasOpenCall: false, eventDate: inDays(10) });
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it('pages the closing lane by deadline: calls with a deadline that have not been ruled out', async () => {
    const page = await list({ lane: 'closing' });
    expect(titles(page.items)).toEqual(['Closing Soon', 'Closing Later']);
    expect(page.total).toBe(2);
  });

  it('pages the open lane by event date, then the rolling calls by quality', async () => {
    const page = await list({ lane: 'open' });
    expect(titles(page.items)).toEqual(['Open Until Event', 'Rolling Podcast', 'Rolling Low']);
    expect(page.total).toBe(3);
  });

  it('pages the watch lane by event date, whatever deadline was stored', async () => {
    const page = await list({ lane: 'watch' });
    expect(titles(page.items)).toEqual(['Watch Early', 'Watch With Deadline']);
    expect(page.total).toBe(2);
  });

  it('lists every lane together when none is asked for, as before lanes', async () => {
    const page = await list({});
    expect(page.total).toBe(7);
    expect(titles(page.items)[0]).toBe('Watch With Deadline');
  });

  it('counts all three lanes and what closes soon on every response, whichever lane it pages', async () => {
    const expected = {
      counts: { closing: 2, open: 3, watch: 2 },
      closingWithin7: 1,
      closingWithin30: 1,
      nextToClose: { title: 'Closing Soon', cfpDeadline: inDays(3).toISOString(), deadlineTimezone: null },
    };
    for (const lane of ['closing', 'open', 'watch', undefined] as const) {
      const page = await list({ lane });
      expect(page.lanes).toMatchObject(expected);
    }
  });

  it('counts the lanes of a search from the rows the search keeps', async () => {
    const closing = await list({ lane: 'closing', search: 'rolling' });
    expect(closing.items).toEqual([]);
    expect(closing.total).toBe(0);
    expect(closing.lanes).toMatchObject({ counts: { closing: 0, open: 2, watch: 0 }, closingWithin7: 0, nextToClose: null });

    const open = await list({ lane: 'open', search: 'rolling' });
    expect(titles(open.items).sort()).toEqual(['Rolling Low', 'Rolling Podcast']);
  });

  it('keeps the lane under the other sorts and filters', async () => {
    const byQuality = await list({ lane: 'open', sortBy: 'quality' });
    expect(titles(byQuality.items)).toEqual(['Rolling Podcast', 'Open Until Event', 'Rolling Low']);
    expect(byQuality.total).toBe(3);

    const podcasts = await list({ lane: 'open', format: ['podcast'] });
    expect(titles(podcasts.items)).toEqual(['Rolling Podcast']);
    expect(podcasts.lanes?.counts).toEqual({ closing: 0, open: 1, watch: 0 });
  });

  it('cuts pages inside a lane with that lane\'s totals', async () => {
    const pages = await Promise.all([1, 2].map((page) => list({ lane: 'open' }, 2, page)));
    expect(pages.map((page) => titles(page.items))).toEqual([['Open Until Event', 'Rolling Podcast'], ['Rolling Low']]);
    expect(pages.every((page) => page.total === 3 && page.totalPages === 2)).toBe(true);
  });
});
