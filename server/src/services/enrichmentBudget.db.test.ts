import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type * as Config from '../config/index.js';
import type * as EnrichmentService from './enrichmentService.js';

// enrichRowsNow reads real rows; only the page fetch and the Claude call are faked.
vi.mock('../config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Config>();
  return { ...actual, config: { ...actual.config, claude: { ...actual.config.claude, apiKey: 'test-key' } } };
});
vi.mock('./pageText.js', () => ({
  fetchPageText: vi.fn(async () => ({ ok: true, text: 'Call for speakers: submit a talk on AI in communications by the deadline.' })),
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
      dateConfidence: null,
    })),
  };
});

import { prisma } from '../lib/prisma.js';
import { enrichRowsNow } from './backgroundEnrichment.js';
import {
  claimNextUnenriched,
  claimUnenrichedByIds,
  DAILY_ENRICHMENT_LIMIT,
  getTodayEnrichmentCount,
  MAX_ENRICHMENT_ATTEMPTS,
  releaseEnrichmentSlot,
  reserveEnrichmentSlot,
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

describe('enrichment budget against Postgres', () => {
  beforeEach(async () => {
    await prisma.enrichmentUsage.deleteMany({ where: { date: { in: [utcDateKey(now), today] } } });
    await prisma.opportunity.deleteMany({ where: { source: 'test' } });
  });

  afterAll(async () => {
    await prisma.enrichmentUsage.deleteMany({ where: { date: { in: [utcDateKey(now), today] } } });
    await prisma.opportunity.deleteMany({ where: { source: 'test' } });
    await prisma.$disconnect();
  });

  it('reserves slots up to the limit and gives one back on release', async () => {
    expect(await reserveEnrichmentSlot(prisma, 2, now)).toEqual({ reserved: true, count: 1 });
    expect(await reserveEnrichmentSlot(prisma, 2, now)).toEqual({ reserved: true, count: 2 });
    expect(await reserveEnrichmentSlot(prisma, 2, now)).toEqual({ reserved: false, count: 2 });

    await releaseEnrichmentSlot(prisma, now);
    expect(await getTodayEnrichmentCount(prisma, now)).toBe(1);
  });

  it('claims an unenriched row once and increments its attempt counter', async () => {
    const row = await prisma.opportunity.create({ data: opportunityRow('claim-me') });

    const first = await claimNextUnenriched(prisma, now);
    expect(first?.id).toBe(row.id);
    expect(first?.enrichmentAttempts).toBe(1);

    // The claim is fresh, so a second worker finds nothing.
    expect(await claimNextUnenriched(prisma, now)).toBeNull();

    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.enrichmentClaimedAt?.toISOString()).toBe(now.toISOString());
    expect(stored.enrichmentAttempts).toBe(1);
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

    // The worker cannot take it now, and neither can a second search.
    expect(await claimNextUnenriched(prisma, now)).toBeNull();
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
});
