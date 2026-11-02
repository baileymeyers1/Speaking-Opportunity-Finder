import type { Prisma } from '@prisma/client';
import { startOfUtcDay } from '../scrapers/lib/html.js';
import { computeQualityScore } from '../scrapers/qualityScore.js';
import { serializeDateConfidence, type MergedOpportunity } from './extraction.js';
import { CLAIM_STALE_MS } from './enrichmentBudget.js';

/**
 * Scheduled re-verification of stored listings against their own page.
 *
 * Runs in the enrichment cron once no unenriched rows remain. Rows whose
 * deadline is close are re-checked often; everything visible is re-checked
 * weekly. Each check reuses the page fetch + extraction path and spends the
 * same daily Claude budget as enrichment.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deadlines inside this window are re-verified every RECHECK_SOON_DAYS. */
export const DEADLINE_SOON_DAYS = 14;
export const RECHECK_SOON_DAYS = 2;
/** Every other visible row is re-verified after this many days. */
export const RECHECK_DAYS = 7;

export interface VerificationWindows {
  today: Date;
  deadlineSoonUntil: Date;
  soonStaleBefore: Date;
  staleBefore: Date;
}

export function verificationWindows(now: Date = new Date()): VerificationWindows {
  const today = startOfUtcDay(now);
  return {
    today,
    deadlineSoonUntil: new Date(today.getTime() + DEADLINE_SOON_DAYS * DAY_MS),
    soonStaleBefore: new Date(now.getTime() - RECHECK_SOON_DAYS * DAY_MS),
    staleBefore: new Date(now.getTime() - RECHECK_DAYS * DAY_MS),
  };
}

function visibleAndUnclaimed(now: Date, today: Date): Prisma.OpportunityWhereInput[] {
  const staleClaimBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  return [
    { isClosed: false },
    { isRelevant: true },
    // Rows still queued for enrichment are the enrichment pass's job.
    { enrichmentStatus: { not: null } },
    { OR: [{ cfpDeadline: { gte: today } }, { cfpDeadline: null }] },
    { OR: [{ enrichmentClaimedAt: null }, { enrichmentClaimedAt: { lt: staleClaimBefore } }] },
  ];
}

/**
 * Two candidate queries in priority order: deadlines within 14 days not
 * verified in 2 days, then any visible row not verified in 7 days.
 */
export function verificationCandidates(now: Date = new Date()): Array<{
  label: 'deadline-soon' | 'stale';
  where: Prisma.OpportunityWhereInput;
  orderBy: Prisma.OpportunityOrderByWithRelationInput;
}> {
  const { today, deadlineSoonUntil, soonStaleBefore, staleBefore } = verificationWindows(now);
  const base = visibleAndUnclaimed(now, today);
  return [
    {
      label: 'deadline-soon',
      where: {
        AND: [
          ...base,
          { cfpDeadline: { gte: today, lte: deadlineSoonUntil } },
          { OR: [{ verifiedAt: null }, { verifiedAt: { lt: soonStaleBefore } }] },
        ],
      },
      orderBy: { cfpDeadline: 'asc' },
    },
    {
      label: 'stale',
      where: {
        AND: [...base, { OR: [{ verifiedAt: null }, { verifiedAt: { lt: staleBefore } }] }],
      },
      orderBy: { verifiedAt: { sort: 'asc', nulls: 'first' } },
    },
  ];
}

export interface VerifiedRowContext {
  isRelevant: boolean;
}

/**
 * Column updates after a successful re-extraction. Dates, location, remote
 * flag, compensation and the closed flag follow the page; title,
 * organization, industries and relevance stay as enrichment set them.
 */
export function buildVerificationUpdate(
  existing: VerifiedRowContext,
  merged: MergedOpportunity,
  now: Date = new Date()
): Prisma.OpportunityUpdateInput {
  return {
    eventDate: merged.eventDate ?? null,
    cfpDeadline: merged.cfpDeadline ?? null,
    location: merged.location ?? null,
    isRemote: merged.isRemote,
    compensationType: merged.compensationType ?? null,
    compensationAmount: merged.compensationAmount ?? null,
    isClosed: merged.isClosed,
    dateConfidence: serializeDateConfidence(merged.dateConfidence),
    qualityScore: computeQualityScore({ ...merged, isRelevant: existing.isRelevant }),
    verifiedAt: now,
    verificationError: null,
    enrichmentClaimedAt: null,
  };
}

/** The page is gone: close the listing and record why. */
export function buildGoneUpdate(reason: string, now: Date = new Date()): Prisma.OpportunityUpdateInput {
  return {
    isClosed: true,
    qualityScore: 0,
    verifiedAt: now,
    verificationError: `Page unavailable: ${reason}`,
    enrichmentClaimedAt: null,
  };
}

/** The check could not be completed; record the error and move on so the queue rotates. */
export function buildVerificationErrorUpdate(error: string, now: Date = new Date()): Prisma.OpportunityUpdateInput {
  return {
    verifiedAt: now,
    verificationError: error,
    enrichmentClaimedAt: null,
  };
}
