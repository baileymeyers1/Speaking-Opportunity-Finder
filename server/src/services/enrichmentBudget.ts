import type { PrismaClient } from '../generated/prisma/client.js';
import { verificationCandidates } from './verification.js';

/**
 * Daily Claude budget and per-row claims for the enrichment worker.
 *
 * Both live in the database rather than module memory so they hold across
 * serverless cold starts and across concurrent cron invocations.
 */

export const DAILY_ENRICHMENT_LIMIT = 200;
export const MAX_ENRICHMENT_ATTEMPTS = 3;
/** A claim older than this is treated as abandoned (crashed or timed-out worker). */
export const CLAIM_STALE_MS = 10 * 60 * 1000;

/** UTC calendar day used as the budget key, e.g. "2026-11-02". */
export function utcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isClaimStale(claimedAt: Date | null, now: Date = new Date()): boolean {
  if (!claimedAt) return true;
  return now.getTime() - claimedAt.getTime() > CLAIM_STALE_MS;
}

/**
 * Reserve one Claude call against today's budget. Call this immediately before
 * the API request; every request is billed whether or not it succeeds.
 */
export async function reserveEnrichmentSlot(
  prisma: PrismaClient,
  limit: number = DAILY_ENRICHMENT_LIMIT,
  now: Date = new Date()
): Promise<{ reserved: boolean; count: number }> {
  const date = utcDateKey(now);

  await prisma.enrichmentUsage.upsert({
    where: { date },
    create: { date, count: 0 },
    update: {},
  });

  // Conditional increment: only one of N concurrent callers can take the last slot.
  const result = await prisma.enrichmentUsage.updateMany({
    where: { date, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });

  const row = await prisma.enrichmentUsage.findUnique({ where: { date } });
  return { reserved: result.count > 0, count: row?.count ?? 0 };
}

/** Give back a slot that was reserved but not spent (e.g. the row was released). */
export async function releaseEnrichmentSlot(prisma: PrismaClient, now: Date = new Date()): Promise<void> {
  const date = utcDateKey(now);
  await prisma.enrichmentUsage.updateMany({
    where: { date, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}

export async function getTodayEnrichmentCount(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const row = await prisma.enrichmentUsage.findUnique({ where: { date: utcDateKey(now) } });
  return row?.count ?? 0;
}

/**
 * Atomically claim the next opportunity that still needs enrichment.
 *
 * Eligible rows have no status yet, fewer than MAX attempts, and either no
 * claim or a stale one. The claim is an optimistic update keyed on the
 * previous `enrichmentClaimedAt`, so two workers cannot take the same row.
 * Returns the row with `enrichmentAttempts` already incremented.
 */
export async function claimNextUnenriched(prisma: PrismaClient, now: Date = new Date()) {
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);

  const candidates = await prisma.opportunity.findMany({
    where: {
      enrichmentStatus: null,
      enrichmentAttempts: { lt: MAX_ENRICHMENT_ATTEMPTS },
      OR: [{ enrichmentClaimedAt: null }, { enrichmentClaimedAt: { lt: staleBefore } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  for (const candidate of candidates) {
    const claimed = await prisma.opportunity.updateMany({
      where: { id: candidate.id, enrichmentClaimedAt: candidate.enrichmentClaimedAt },
      data: { enrichmentClaimedAt: now, enrichmentAttempts: { increment: 1 } },
    });
    if (claimed.count === 1) {
      return { ...candidate, enrichmentClaimedAt: now, enrichmentAttempts: candidate.enrichmentAttempts + 1 };
    }
  }

  return null;
}

/** Undo a claim without consuming an attempt (used when the budget is exhausted). */
export async function releaseClaim(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.opportunity.update({
    where: { id },
    data: { enrichmentClaimedAt: null, enrichmentAttempts: { decrement: 1 } },
  });
}

/**
 * Atomically claim the next row due for re-verification (see verification.ts
 * for the priority order). Uses the same `enrichmentClaimedAt` lock as
 * enrichment, without touching the attempt counter.
 */
export async function claimNextForVerification(prisma: PrismaClient, now: Date = new Date()) {
  for (const candidate of verificationCandidates(now)) {
    const rows = await prisma.opportunity.findMany({
      where: candidate.where,
      orderBy: candidate.orderBy,
      take: 5,
    });

    for (const row of rows) {
      const claimed = await prisma.opportunity.updateMany({
        where: { id: row.id, enrichmentClaimedAt: row.enrichmentClaimedAt },
        data: { enrichmentClaimedAt: now },
      });
      if (claimed.count === 1) {
        return { ...row, enrichmentClaimedAt: now, verificationReason: candidate.label };
      }
    }
  }

  return null;
}

/** Undo a verification claim (used when the budget is exhausted). */
export async function releaseVerificationClaim(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.opportunity.update({ where: { id }, data: { enrichmentClaimedAt: null } });
}
