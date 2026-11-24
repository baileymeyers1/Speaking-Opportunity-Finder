import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type * as Config from '../config/index.js';
import type * as EnrichmentService from './enrichmentService.js';

// enrichRowsNow reads real rows; only the page fetch and the Claude call are faked.
vi.mock('../config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Config>();
  return { ...actual, config: { ...actual.config, claude: { ...actual.config.claude, apiKey: 'test-key' } } };
});
vi.mock('./pageReader.js', () => ({
  readPage: vi.fn(async () => ({ ok: true, text: 'Call for speakers: submit a talk on AI in communications by the deadline.' })),
}));
vi.mock('./enrichmentService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof EnrichmentService>();
  return {
    ...actual,
    enrichOpportunity: vi.fn(async (result: Parameters<typeof actual.enrichOpportunity>[0]) => ({
      ...result,
      enrichmentStatus: 'enriched' as const,
      enrichedAt: new Date(),
      isClosed: false,
      isRelevant: true,
      hasOpenCall: true,
      dateConfidence: { eventDate: 'low' as const, cfpDeadline: 'low' as const, location: 'low' as const },
    })),
  };
});

import { prisma } from '../lib/prisma.js';
import { enrichRowsNow, processNextBatch } from './backgroundEnrichment.js';
import { readPage } from './pageReader.js';
import {
  claimNextUnenriched,
  claimUnenrichedByIds,
  DAILY_ENRICHMENT_LIMIT,
  getTodayEnrichmentCount,
  getTodayPageReaderCount,
  MAX_ENRICHMENT_ATTEMPTS,
  pageReaderUsageKey,
  parseReaderLimit,
  releaseEnrichmentSlot,
  reserveEnrichmentSlot,
  reservePageReaderSlot,
  utcDateKey,
} from './enrichmentBudget.js';

/**
 * Runs against the test Postgres database (server/vitest.config.ts): the
 * budget counter and the claim lock are the two places where the DB, not
 * process memory, is the source of truth, so they are exercised for real.
 */
const now = new Date('2026-11-03T10:00:00Z');

function opportunityRow(suffix: string) {
  return {
    title: `Row ${suffix}`,
    organization: 'Budget Test Org',
    description: 'A call for speakers used by the budget tests',
    format: 'conference',
    applyUrl: `https://example.test/cfp/${suffix}`,
    source: 'test',
  };
}

const today = utcDateKey(new Date());

const SEARCH_HIT_URL = 'https://budget-test.example/hit/';

/** A hit the scheduled search stored, waiting to be read. */
function searchHit(suffix: string) {
  return { ...opportunityRow(suffix), applyUrl: `${SEARCH_HIT_URL}${suffix}`, source: 'Linkup Search' };
}

/** This suite's rows, and the events the worker gave them. */
async function removeTestRows() {
  const where = { OR: [{ source: 'test' }, { applyUrl: { startsWith: SEARCH_HIT_URL } }] };
  const rows = await prisma.opportunity.findMany({ where, select: { eventId: true } });
  await prisma.opportunity.deleteMany({ where });
  const eventIds = [...new Set(rows.map((row) => row.eventId).filter((id): id is string => id !== null))];
  if (eventIds.length > 0) await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
}

describe('enrichment budget against Postgres', () => {
  beforeEach(async () => {
    await prisma.enrichmentUsage.deleteMany({ where: { date: { in: [utcDateKey(now), today, pageReaderUsageKey(now)] } } });
    await removeTestRows();
  });

  afterAll(async () => {
    await prisma.enrichmentUsage.deleteMany({ where: { date: { in: [utcDateKey(now), today, pageReaderUsageKey(now)] } } });
    await removeTestRows();
    await prisma.$disconnect();
  });

  it('reserves slots up to the limit and gives one back on release', async () => {
    expect(await reserveEnrichmentSlot(prisma, 2, now)).toEqual({ reserved: true, count: 1 });
    expect(await reserveEnrichmentSlot(prisma, 2, now)).toEqual({ reserved: true, count: 2 });
    expect(await reserveEnrichmentSlot(prisma, 2, now)).toEqual({ reserved: false, count: 2 });

    await releaseEnrichmentSlot(prisma, now);
    expect(await getTodayEnrichmentCount(prisma, now)).toBe(1);
  });

  it('reserves the first slots of a day for callers that arrive together', async () => {
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => reserveEnrichmentSlot(prisma, 4, now)));
    expect(outcomes.filter((outcome) => outcome.reserved)).toHaveLength(4);
    expect(await getTodayEnrichmentCount(prisma, now)).toBe(4);
  });

  it('keeps the reader cap apart from the Claude budget, in the same table', async () => {
    expect(pageReaderUsageKey(now)).toBe('2026-11-03:reader');
    expect(await reservePageReaderSlot(prisma, 2, now)).toEqual({ reserved: true, count: 1 });
    expect(await reservePageReaderSlot(prisma, 2, now)).toEqual({ reserved: true, count: 2 });
    expect(await reservePageReaderSlot(prisma, 2, now)).toEqual({ reserved: false, count: 2 });
    expect(await getTodayPageReaderCount(prisma, now)).toBe(2);
    // The Claude count is read by the plain date and never sees reader calls.
    expect(await getTodayEnrichmentCount(prisma, now)).toBe(0);
    expect(await reserveEnrichmentSlot(prisma, 1, now)).toEqual({ reserved: true, count: 1 });
    expect(await getTodayPageReaderCount(prisma, now)).toBe(2);
  });

  it('reserves nothing when the reader cap is 0, which is how it is switched off', async () => {
    expect(await reservePageReaderSlot(prisma, 0, now)).toEqual({ reserved: false, count: 0 });
    expect(await getTodayPageReaderCount(prisma, now)).toBe(0);
    expect(parseReaderLimit('0')).toBe(0);
    expect(parseReaderLimit('40')).toBe(40);
    expect(parseReaderLimit(undefined)).toBe(300);
    expect(parseReaderLimit('-5')).toBe(300);
    expect(parseReaderLimit('many')).toBe(300);
  });

  it('claims an unenriched row once and increments its attempt counter', async () => {
    // Dated ahead of real time, so an unread row another suite has just written is older.
    const row = await prisma.opportunity.create({ data: { ...opportunityRow('claim-me'), createdAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });

    const first = await claimNextUnenriched(prisma, now);
    expect(first?.id).toBe(row.id);
    expect(first?.enrichmentAttempts).toBe(1);

    // The claim is fresh, so nobody can take the same row. Asked by name: a worker's
    // claim would take some other suite's unread row from the shared database.
    expect(await claimUnenrichedByIds(prisma, [row.id], now)).toEqual([]);

    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.enrichmentClaimedAt?.toISOString()).toBe(now.toISOString());
    expect(stored.enrichmentAttempts).toBe(1);
  });

  it('claims what a live search left unread before newer rows from anywhere else', async () => {
    // Dated ahead of real time, so rows another suite has just written are older than these.
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    const live = await prisma.opportunity.create({
      data: { ...searchHit('live-leftover'), source: 'Live Search', createdAt: new Date(tomorrow - 60 * 60 * 1000) },
    });
    const scheduled = await prisma.opportunity.create({ data: { ...searchHit('scheduled-newer'), createdAt: new Date(tomorrow) } });
    const scraped = await prisma.opportunity.create({ data: { ...opportunityRow('scraped-newest'), createdAt: new Date(tomorrow) } });

    expect((await claimNextUnenriched(prisma, now))?.id).toBe(live.id);
    const next = [(await claimNextUnenriched(prisma, now))?.id, (await claimNextUnenriched(prisma, now))?.id];
    expect(next.sort()).toEqual([scheduled.id, scraped.id].sort());
  });

  it('reads a batch several rows at a time, each row once', async () => {
    const rows = await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((suffix) => prisma.opportunity.create({ data: { ...searchHit(`batch-${suffix}`), source: 'Live Search' } }))
    );
    const page = { ok: true as const, status: 200, text: 'Call for speakers: submit a talk on AI in communications by the deadline.' };
    // Each read holds until three are in flight (or a second passes), so the count
    // does not depend on how fast the claims run on a loaded test database.
    let inFlight = 0;
    let mostInFlight = 0;
    vi.mocked(readPage).mockImplementation(async () => {
      inFlight++;
      mostInFlight = Math.max(mostInFlight, inFlight);
      const until = Date.now() + 1000;
      while (inFlight < 3 && mostInFlight < 3 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return page;
    });

    try {
      const result = await processNextBatch(rows.length, { concurrency: 3 });
      expect(result.enriched).toBe(rows.length);
    } finally {
      vi.mocked(readPage).mockReset();
      vi.mocked(readPage).mockImplementation(async () => page);
    }

    expect(mostInFlight).toBe(3);
    const stored = await prisma.opportunity.findMany({ where: { id: { in: rows.map((row) => row.id) } } });
    expect(stored.every((row) => row.enrichmentStatus === 'enriched' && row.enrichmentAttempts === 1)).toBe(true);
  });

  it('claims named rows for a live search, skipping rows another worker holds or that are done', async () => {
    const free = await prisma.opportunity.create({ data: opportunityRow('free') });
    const held = await prisma.opportunity.create({ data: { ...opportunityRow('held'), enrichmentClaimedAt: now } });
    const done = await prisma.opportunity.create({ data: { ...opportunityRow('done'), enrichmentStatus: 'enriched' } });
    const exhausted = await prisma.opportunity.create({
      data: { ...opportunityRow('exhausted'), enrichmentAttempts: MAX_ENRICHMENT_ATTEMPTS },
    });

    const claimed = await claimUnenrichedByIds(prisma, [free.id, held.id, done.id, exhausted.id], now);
    expect(claimed.map((row) => row.id)).toEqual([free.id]);
    expect(claimed[0].enrichmentAttempts).toBe(1);

    // Nobody can take it now: worker and searches claim through the same lock. Asked by
    // name, since a worker's claim would take some other suite's unread row.
    expect(await claimUnenrichedByIds(prisma, [free.id], now)).toEqual([]);
  });

  it('takes over a stale claim', async () => {
    const stale = await prisma.opportunity.create({
      data: { ...opportunityRow('stale'), enrichmentClaimedAt: new Date(now.getTime() - 60 * 60 * 1000) },
    });
    const claimed = await claimUnenrichedByIds(prisma, [stale.id], now);
    expect(claimed.map((row) => row.id)).toEqual([stale.id]);
  });

  it('lets a live search read named rows after the worker has spent the daily limit', async () => {
    await prisma.enrichmentUsage.create({ data: { date: today, count: DAILY_ENRICHMENT_LIMIT } });
    const row = await prisma.opportunity.create({ data: opportunityRow('after-limit') });

    expect(await enrichRowsNow([row.id])).toEqual({ claimed: 1, read: 1 });

    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.enrichmentStatus).toBe('enriched');
    expect(stored.enrichmentClaimedAt).toBeNull();
    // Counted in today's usage, so the admin page shows the spend.
    expect(await getTodayEnrichmentCount(prisma)).toBe(DAILY_ENRICHMENT_LIMIT + 1);
  });

  it('spends no Claude call on a search hit whose page cannot be read, and leaves it unverified', async () => {
    vi.mocked(readPage).mockResolvedValueOnce({ ok: false, reason: 'http_error', status: 403, message: 'HTTP 403 (reader: FETCH_TARGET_NOT_FOUND)' });
    const row = await prisma.opportunity.create({ data: searchHit('blocked') });

    await enrichRowsNow([row.id]);

    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored).toMatchObject({
      enrichmentStatus: 'skipped',
      enrichmentError: 'page unreadable: HTTP 403 (reader: FETCH_TARGET_NOT_FOUND)',
      verifiedAt: null,
      enrichmentClaimedAt: null,
      // Nobody has read it, so nothing says it is an event yet.
      eventId: null,
    });
    expect(await getTodayEnrichmentCount(prisma)).toBe(0);
  });

  it('marks a search hit verified when it was enriched from its own page', async () => {
    const row = await prisma.opportunity.create({ data: searchHit('readable') });

    expect(await enrichRowsNow([row.id])).toEqual({ claimed: 1, read: 1 });

    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.enrichmentStatus).toBe('enriched');
    expect(stored.verifiedAt).not.toBeNull();
    expect(stored.verificationError).toBeNull();
    expect(stored.hasOpenCall).toBe(true);
    expect(await getTodayEnrichmentCount(prisma)).toBe(1);
  });

  it('gives a row its event once it has read it, when live search stored it without one', async () => {
    const row = await prisma.opportunity.create({ data: { ...searchHit('unmatched'), title: 'Budgetcheck Summit 2027' } });
    expect(row.eventId).toBeNull();

    await enrichRowsNow([row.id]);

    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: row.id }, include: { event: true } });
    expect(stored.eventId).not.toBeNull();
    expect(stored.event?.canonicalName).toBe('Budgetcheck Summit');
  });
});
