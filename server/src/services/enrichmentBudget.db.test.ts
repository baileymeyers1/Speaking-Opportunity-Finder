import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import {
  claimNextUnenriched,
  claimUnenrichedByIds,
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

describe('enrichment budget against Postgres', () => {
  beforeEach(async () => {
    await prisma.enrichmentUsage.deleteMany({ where: { date: utcDateKey(now) } });
    await prisma.opportunity.deleteMany({ where: { source: 'test' } });
  });

  afterAll(async () => {
    await prisma.enrichmentUsage.deleteMany({ where: { date: utcDateKey(now) } });
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
});
