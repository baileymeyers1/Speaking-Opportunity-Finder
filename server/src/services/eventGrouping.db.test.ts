import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { assignEvents } from './eventAssignment.js';
import { shadowedEditionIds } from './eventContext.js';
import { getOpportunities, getOpportunityById } from './opportunityService.js';

/**
 * Against the test Postgres database: the one-card-per-event rule is a SQL
 * window function, and pagination must count hidden rows out.
 */
const SOURCE = 'test-grouping';
const now = new Date('2026-11-04T10:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

async function store(input: { title: string; applyUrl: string; source: string; cfpDeadline: Date | null; eventDate: Date | null; quality?: number }) {
  return prisma.opportunity.create({
    data: {
      title: input.title,
      organization: input.title,
      applyUrl: input.applyUrl,
      format: 'conference',
      source: input.source,
      cfpDeadline: input.cfpDeadline,
      eventDate: input.eventDate,
      qualityScore: input.quality ?? 60,
      location: 'Brussels (Belgium)',
      description: 'grouping test row',
      // Other DB test files claim unenriched rows; keep these out of their way.
      enrichmentStatus: 'enriched',
    },
  });
}

async function reset() {
  const rows = await prisma.opportunity.findMany({ where: { description: 'grouping test row' }, select: { eventId: true } });
  await prisma.opportunity.deleteMany({ where: { description: 'grouping test row' } });
  const ids = [...new Set(rows.map((r) => r.eventId).filter((id): id is string => id !== null))];
  if (ids.length) await prisma.event.deleteMany({ where: { id: { in: ids } } });
  await prisma.event.deleteMany({ where: { slug: { startsWith: 'brusselsfest' } } });
  await prisma.event.deleteMany({ where: { slug: { startsWith: 'lonely-con' } } });
}

describe('one card per event', () => {
  let brusselsfestA: string;
  let brusselsfestB: string;
  let brusselsfestLastYear: string;
  let lonely: string;

  beforeAll(async () => {
    await reset();
    const rows = [
      // Same 2027 edition from three sources: nearest deadline must win.
      await store({ title: 'Brusselsfest 2027', applyUrl: 'https://brusselsfest.org/2027/cfp', source: `${SOURCE}-a`, cfpDeadline: inDays(20), eventDate: new Date('2027-01-30') }),
      await store({ title: 'Brusselsfest 2027', applyUrl: 'https://pretalx.com/brusselsfest-2027/cfp', source: `${SOURCE}-b`, cfpDeadline: inDays(10), eventDate: new Date('2027-01-30') }),
      await store({ title: 'Brusselsfest 2027', applyUrl: 'https://wikicfp.example/brusselsfest', source: `${SOURCE}-c`, cfpDeadline: null, eventDate: new Date('2027-01-30') }),
      // Last year's edition, deadline passed: hidden by the default filter, listed as a previous edition.
      await store({ title: 'Brusselsfest 2026', applyUrl: 'https://brusselsfest.org/2026/cfp', source: `${SOURCE}-a`, cfpDeadline: inDays(-300), eventDate: new Date('2026-01-31') }),
      // An event of its own.
      await store({ title: 'Lonely Con 2027', applyUrl: 'https://lonelycon.example/cfp', source: `${SOURCE}-a`, cfpDeadline: inDays(5), eventDate: new Date('2027-06-01') }),
    ];
    [brusselsfestA, brusselsfestB] = [rows[0].id, rows[1].id];
    brusselsfestLastYear = rows[3].id;
    lonely = rows[4].id;
    await assignEvents(prisma, rows, now);
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it('links the four Brusselsfest rows to one event', async () => {
    const events = await prisma.event.findMany({ where: { slug: { startsWith: 'brusselsfest' } }, include: { editions: true } });
    expect(events).toHaveLength(1);
    expect(events[0].editions).toHaveLength(4);
  });

  it('hides every visible edition but the one with the nearest open deadline', async () => {
    const shadowed = await shadowedEditionIds(now);
    const brusselsfestRows = await prisma.opportunity.findMany({ where: { title: 'Brusselsfest 2027' }, select: { id: true } });
    const hidden = brusselsfestRows.filter((r) => shadowed.includes(r.id)).map((r) => r.id).sort();
    expect(hidden).toHaveLength(2);
    expect(hidden).not.toContain(brusselsfestB);
    expect(shadowed).not.toContain(lonely);
    expect(shadowed).not.toContain(brusselsfestLastYear); // not visible anyway, never counted
  });

  it('lists one Brusselsfest card with the other sources and last year as a previous edition, and paginates over the rest', async () => {
    const page = await getOpportunities({ search: 'Brusselsfest' }, { page: 1, pageSize: 20 }, { now });
    const brusselsfest = page.items.filter((item) => item.title === 'Brusselsfest 2027');
    expect(brusselsfest).toHaveLength(1);
    expect(brusselsfest[0].id).toBe(brusselsfestB);
    expect(brusselsfest[0].alsoListedOn).toEqual([`${SOURCE}-a`, `${SOURCE}-c`]);
    expect(brusselsfest[0].previousEditions).toHaveLength(1);
    expect(brusselsfest[0].previousEditions?.[0].year).toBe(2026);
    expect(page.total).toBe(1);
  });

  it('counts hidden rows out of the total, so page sizes are exact', async () => {
    const all = await getOpportunities({ location: 'Brussels' }, { page: 1, pageSize: 1 }, { now });
    // Brusselsfest (one card) and Lonely Con: two visible items, not four.
    expect(all.total).toBe(2);
    expect(all.totalPages).toBe(2);
    const second = await getOpportunities({ location: 'Brussels' }, { page: 2, pageSize: 1 }, { now });
    expect(new Set([all.items[0].id, second.items[0].id])).toEqual(new Set([brusselsfestB, lonely]));
  });

  it('returns every edition of the event on the detail response', async () => {
    const detail = await getOpportunityById(brusselsfestA, { now });
    expect(detail.eventEditions?.map((e) => e.id).sort()).toHaveLength(4);
    expect(detail.eventEditions?.[0].year).toBe(2027);
    expect(detail.eventEditions?.at(-1)?.year).toBe(2026);
    expect(detail.alsoListedOn).toEqual([`${SOURCE}-b`, `${SOURCE}-c`]);
  });
});
