import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { getOpportunities } from './opportunityService.js';

/**
 * Against the test Postgres database: the default list is ordered by when a
 * call closes, with rows that have no deadline placed by their event date or
 * as rolling calls, and pages cut from that order.
 */
const MARKER = 'list order test row';
// The place keeps the list to this file's rows; in person only, since a place also lists every call held online.
const PLACE = 'Orderville';
const now = new Date('2026-11-19T12:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

async function store(title: string, dates: { cfpDeadline?: Date; eventDate?: Date; format?: string }) {
  return prisma.opportunity.create({
    data: {
      title,
      organization: 'Order Test Org',
      applyUrl: `https://list-order.example/${title.toLowerCase().replace(/\s+/g, '-')}`,
      format: dates.format ?? 'conference',
      source: 'test-list-order',
      cfpDeadline: dates.cfpDeadline ?? null,
      eventDate: dates.eventDate ?? null,
      location: `${PLACE}, ZZ`,
      qualityScore: 50,
      description: MARKER,
      // Read already, so the enrichment-budget tests running alongside never claim these.
      enrichmentStatus: 'enriched',
    },
  });
}

const reset = () => prisma.opportunity.deleteMany({ where: { description: MARKER } });
const titles = (items: Array<{ title: string }>) => items.map((item) => item.title);

describe('default list order', () => {
  beforeAll(async () => {
    await reset();
    await store('Late Deadline', { cfpDeadline: inDays(45) });
    await store('Rolling Podcast', { format: 'podcast' });
    await store('Far Event', { eventDate: inDays(60) });
    await store('Soon Deadline', { cfpDeadline: inDays(5) });
    await store('Event Next Week', { eventDate: inDays(12) });
    await store('This Month Deadline', { cfpDeadline: inDays(20), eventDate: inDays(200) });
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  const EXPECTED = ['Soon Deadline', 'Event Next Week', 'This Month Deadline', 'Rolling Podcast', 'Late Deadline', 'Far Event'];

  it('lists a row without a deadline where it closes, not after every dated row', async () => {
    const page = await getOpportunities({ location: PLACE, isRemote: false }, { page: 1, pageSize: 20 }, { now });
    expect(titles(page.items)).toEqual(EXPECTED);
    expect(page.total).toBe(6);
  });

  it('is the same order for the explicit deadline sort', async () => {
    const page = await getOpportunities({ location: PLACE, isRemote: false, sortBy: 'deadline' }, { page: 1, pageSize: 20 }, { now });
    expect(titles(page.items)).toEqual(EXPECTED);
  });

  it('cuts pages from that order with exact totals', async () => {
    const pages = await Promise.all([1, 2, 3, 4].map((page) => getOpportunities({ location: PLACE, isRemote: false }, { page, pageSize: 2 }, { now })));
    expect(pages.map((page) => titles(page.items))).toEqual([EXPECTED.slice(0, 2), EXPECTED.slice(2, 4), EXPECTED.slice(4, 6), []]);
    expect(pages.every((page) => page.total === 6 && page.totalPages === 3)).toBe(true);
  });

  it('keeps the other filters: the rolling podcast is first when only podcasts are asked for', async () => {
    const page = await getOpportunities({ location: PLACE, isRemote: false, format: ['podcast'] }, { page: 1, pageSize: 20 }, { now });
    expect(titles(page.items)).toEqual(['Rolling Podcast']);
  });

  it('leaves the event-date sort to the database', async () => {
    const page = await getOpportunities({ location: PLACE, isRemote: false, sortBy: 'eventDate' }, { page: 1, pageSize: 20 }, { now });
    expect(titles(page.items).slice(0, 3)).toEqual(['Event Next Week', 'Far Event', 'This Month Deadline']);
    expect(page.total).toBe(6);
  });
});
