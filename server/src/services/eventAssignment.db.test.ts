import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { assignEvent, assignEvents } from './eventAssignment.js';
import { AUTO_LINK_SCORE, REVIEW_SCORE } from './eventMatching.js';

/**
 * Against the test Postgres database (server/vitest.config.ts): candidate
 * lookup uses the `nameTokens` array overlap and the slug unique index, which
 * only Postgres can exercise.
 */
const SOURCE = 'test-events';
const now = new Date('2026-11-04T10:00:00Z');

async function storeRow(input: {
  title: string;
  applyUrl: string;
  eventDate?: string | null;
  location?: string | null;
  organization?: string;
  source?: string;
}) {
  return prisma.opportunity.create({
    data: {
      title: input.title,
      organization: input.organization ?? input.title,
      applyUrl: input.applyUrl,
      eventDate: input.eventDate ? new Date(input.eventDate) : null,
      location: input.location ?? null,
      format: 'conference',
      source: input.source ?? SOURCE,
      qualityScore: 50,
      // Other DB test files claim unenriched rows; keep these out of their way.
      enrichmentStatus: 'enriched',
    },
  });
}

async function reset() {
  const rows = await prisma.opportunity.findMany({ where: { source: { startsWith: SOURCE } }, select: { eventId: true } });
  await prisma.opportunity.deleteMany({ where: { source: { startsWith: SOURCE } } });
  const eventIds = [...new Set(rows.map((r) => r.eventId).filter((id): id is string => id !== null))];
  if (eventIds.length) await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.event.deleteMany({ where: { slug: { startsWith: 'bsides-rocket-city' } } });
  await prisma.event.deleteMany({ where: { slug: { startsWith: 'react-summit' } } });
  await prisma.event.deleteMany({ where: { slug: { startsWith: 'fosdem' } } });
}

describe('assignEvent against Postgres', () => {
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it('creates an event for a new conference and stamps the edition year', async () => {
    const row = await storeRow({ title: 'BSides Rocket City 2027', applyUrl: 'https://sessionize.com/bsides-rocket-city2007/', eventDate: '2027-03-20' });
    const result = await assignEvent(prisma, row, now);

    expect(result.outcome).toBe('created');
    expect(result.editionYear).toBe(2027);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: result.eventId! } });
    expect(event.canonicalName).toBe('BSides Rocket City');
    expect(event.slug).toBe('bsides-rocket-city');
    expect(event.domain).toBeNull(); // Sessionize is a shared platform
    expect(event.nameTokens).toEqual(['bsides', 'rocket', 'city']);
    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.eventId).toBe(event.id);
    expect(stored.editionYear).toBe(2027);
  });

  it('links the same conference from another source to the existing event and records its domain', async () => {
    const first = await storeRow({ title: 'BSides Rocket City 2027', applyUrl: 'https://sessionize.com/bsides-rocket-city2007/', eventDate: '2027-03-20', location: 'Huntsville, AL (USA)' });
    const second = await storeRow({ title: 'BSides Rocket City', applyUrl: 'https://bsidesrocketcity.org', eventDate: '2027-03-20', location: 'Huntsville, Alabama, United States', source: `${SOURCE}-b` });
    const created = await assignEvent(prisma, first, now);
    const linked = await assignEvent(prisma, second, now);

    expect(linked.outcome).toBe('linked');
    expect(linked.eventId).toBe(created.eventId);
    expect(linked.score).toBeGreaterThanOrEqual(AUTO_LINK_SCORE);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: created.eventId! }, include: { editions: true } });
    expect(event.editions).toHaveLength(2);
    expect(event.domain).toBe('bsidesrocketcity.org');
    expect(await prisma.event.count({ where: { slug: { startsWith: 'bsides-rocket-city' } } })).toBe(1);
  });

  it('links next year to the same event with a different edition year', async () => {
    const lastYear = await storeRow({ title: 'FOSDEM 2026', applyUrl: 'https://fosdem.org/2026/news/call-for-main-track/', eventDate: '2026-01-31' });
    const thisYear = await storeRow({ title: 'FOSDEM 2027', applyUrl: 'https://fosdem.org/2027/news/call-for-main-track/', eventDate: '2027-01-30' });
    const a = await assignEvent(prisma, lastYear, now);
    const b = await assignEvent(prisma, thisYear, now);

    expect(b.outcome).toBe('linked');
    expect(b.eventId).toBe(a.eventId);
    expect(a.editionYear).toBe(2026);
    expect(b.editionYear).toBe(2027);
  });

  it('keeps a look-alike apart and records it as a possible duplicate', async () => {
    const summit = await storeRow({ title: 'React Summit', applyUrl: 'https://gitnation.com/events/react-summit-2027/cfp', eventDate: '2027-05-21', location: 'Amsterdam, Netherlands' });
    const asia = await storeRow({ title: 'React Summit Asia', applyUrl: 'https://gitnation.com/events/react-summit-asia/cfp', eventDate: '2027-04-15', location: 'Singapore, Singapore' });
    const first = await assignEvent(prisma, summit, now);
    const second = await assignEvent(prisma, asia, now);

    expect(second.outcome).toBe('created-possible');
    expect(second.eventId).not.toBe(first.eventId);
    expect(second.possibleEventId).toBe(first.eventId);
    expect(second.score).toBeGreaterThanOrEqual(REVIEW_SCORE);
    expect(second.score).toBeLessThan(AUTO_LINK_SCORE);
    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: asia.id } });
    expect(stored.possibleEventId).toBe(first.eventId);
    expect(stored.possibleEventScore).toBeCloseTo(second.score, 3);
    const events = await prisma.event.findMany({ where: { slug: { startsWith: 'react-summit' } }, orderBy: { slug: 'asc' } });
    expect(events.map((e) => e.slug)).toEqual(['react-summit', 'react-summit-asia']);
  });

  it('gives a row with no usable name no event, only an edition year', async () => {
    const row = await storeRow({ title: 'Call for Papers 2027', applyUrl: 'https://sessionize.com/some-event/', eventDate: null });
    const result = await assignEvent(prisma, row, now);

    expect(result.outcome).toBe('unmatchable');
    expect(result.eventId).toBeNull();
    expect(result.editionYear).toBe(2027);
  });

  it('keeps a lone row on its own event when re-evaluated', async () => {
    const row = await storeRow({ title: 'BSides Rocket City 2027', applyUrl: 'https://sessionize.com/bsides-rocket-city2007/', eventDate: '2027-03-20' });
    const first = await assignEvent(prisma, row, now);
    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: row.id } });
    const second = await assignEvent(prisma, stored, now);

    expect(second.outcome).toBe('linked');
    expect(second.eventId).toBe(first.eventId);
    expect(await prisma.event.count({ where: { slug: { startsWith: 'bsides-rocket-city' } } })).toBe(1);
  });

  it('is idempotent: a second pass over the same rows creates nothing new', async () => {
    const rows = [
      await storeRow({ title: 'BSides Rocket City 2027', applyUrl: 'https://sessionize.com/bsides-rocket-city2007/', eventDate: '2027-03-20' }),
      await storeRow({ title: 'BSides Rocket City', applyUrl: 'https://bsidesrocketcity.org', eventDate: '2027-03-20', source: `${SOURCE}-b` }),
    ];
    await assignEvents(prisma, rows, now);
    const eventsAfterFirst = await prisma.event.count({ where: { slug: { startsWith: 'bsides-rocket-city' } } });
    const stored = await prisma.opportunity.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'asc' } });
    const again = await assignEvents(prisma, stored, now);

    expect(eventsAfterFirst).toBe(1);
    expect(await prisma.event.count({ where: { slug: { startsWith: 'bsides-rocket-city' } } })).toBe(1);
    expect(again.map((r) => r.outcome)).toEqual(['linked', 'linked']);
  });
});
