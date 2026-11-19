import type { Prisma } from '../generated/prisma/client.js';
import { startOfUtcDay } from '../scrapers/lib/html.js';
import { computeQualityScore } from '../scrapers/qualityScore.js';
import { serializeDateConfidence, type MergedOpportunity } from './extraction.js';
import { CLAIM_STALE_MS } from './enrichmentBudget.js';
import { deadlineOrUpcomingEvent } from './opportunityQuery.js';
import { isSearchSource, openCallAfterRead, SEARCH_SOURCES } from './searchSources.js';

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
/**
 * A search hit whose page could never be read is tried again on each weekly
 * pass for this long, then left alone: the row stays, so the URL is not stored
 * and fetched afresh every time a search finds it again.
 */
export const UNREADABLE_GIVE_UP_DAYS = 30;

export interface VerificationWindows {
  today: Date;
  deadlineSoonUntil: Date;
  soonStaleBefore: Date;
  staleBefore: Date;
  unreadableGiveUpBefore: Date;
}

export function verificationWindows(now: Date = new Date()): VerificationWindows {
  const today = startOfUtcDay(now);
  return {
    today,
    deadlineSoonUntil: new Date(today.getTime() + DEADLINE_SOON_DAYS * DAY_MS),
    soonStaleBefore: new Date(now.getTime() - RECHECK_SOON_DAYS * DAY_MS),
    staleBefore: new Date(now.getTime() - RECHECK_DAYS * DAY_MS),
    unreadableGiveUpBefore: new Date(now.getTime() - UNREADABLE_GIVE_UP_DAYS * DAY_MS),
  };
}

function visibleAndUnclaimed(now: Date, windows: VerificationWindows): Prisma.OpportunityWhereInput[] {
  const staleClaimBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  return [
    { isClosed: false },
    { isRelevant: true },
    // Rows still queued for enrichment are the enrichment pass's job.
    { enrichmentStatus: { not: null } },
    { OR: [{ cfpDeadline: { gte: windows.today } }, { cfpDeadline: null }] },
    // No deadline and the event has happened: not listed, so not worth a check.
    deadlineOrUpcomingEvent(windows.today),
    // A search hit never enriched (its page was unreadable) is retried for a month.
    {
      NOT: {
        source: { in: [...SEARCH_SOURCES] },
        enrichmentStatus: { not: 'enriched' },
        createdAt: { lt: windows.unreadableGiveUpBefore },
      },
    },
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
  const windows = verificationWindows(now);
  const { today, deadlineSoonUntil, soonStaleBefore, staleBefore } = windows;
  const base = visibleAndUnclaimed(now, windows);
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
  source: string;
  isRelevant: boolean;
}

/**
 * Column updates after a successful re-extraction. Dates, location, remote
 * flag, compensation, the closed flag and whether a call is open follow the
 * page (an event listed without a call becomes an open call once one is
 * posted), and so do the sectors: a check is a fresh reading of what the event
 * is, and it replaces sectors the tag mapping guessed. Title, organization and
 * industries stay as enrichment set them.
 *
 * Relevance follows the page for a search hit, where the page is the only
 * evidence that the row is an event at all: a directory or an article judged
 * relevant once is dropped the next time it is read. A row from a CFP listing
 * keeps the relevance enrichment gave it. See `openCallAfterRead` for how the
 * same distinction applies to "is a call open".
 */
export function buildVerificationUpdate(
  existing: VerifiedRowContext,
  merged: MergedOpportunity,
  now: Date = new Date()
): Prisma.OpportunityUpdateInput {
  const fromSearch = isSearchSource(existing.source);
  const isRelevant = fromSearch ? merged.isRelevant : existing.isRelevant;
  return {
    eventDate: merged.eventDate ?? null,
    cfpDeadline: merged.cfpDeadline ?? null,
    deadlineTimezone: merged.cfpDeadline ? (merged.deadlineTimezone ?? null) : null,
    location: merged.location ?? null,
    isRemote: merged.isRemote,
    compensationType: merged.compensationType ?? null,
    compensationAmount: merged.compensationAmount ?? null,
    sectors: merged.sectors,
    format: merged.format,
    isClosed: merged.isClosed,
    ...(fromSearch ? { isRelevant } : {}),
    hasOpenCall: openCallAfterRead(existing.source, { isRelevant, hasOpenCall: merged.hasOpenCall }),
    dateConfidence: serializeDateConfidence(merged.dateConfidence),
    qualityScore: computeQualityScore({ ...merged, isRelevant }),
    verifiedAt: now,
    verificationError: null,
    enrichmentClaimedAt: null,
  };
}

/**
 * Column updates when a row is enriched: everything the extraction cleaned or
 * found. `pageRead` says whether the extraction saw the page itself; only then
 * does the row count as verified (a description alone verifies nothing).
 *
 * Used by the enrichment worker, and by verification the first time it gets
 * to read the page of a search hit that enrichment could not read.
 */
export function buildEnrichmentUpdate(
  merged: MergedOpportunity,
  { pageRead, now = new Date() }: { pageRead: boolean; now?: Date }
): Prisma.OpportunityUpdateInput {
  const isRelevant = merged.isRelevant;
  return {
    title: merged.title,
    organization: merged.organization,
    cfpDeadline: merged.cfpDeadline || null,
    deadlineTimezone: merged.cfpDeadline ? (merged.deadlineTimezone ?? null) : null,
    eventDate: merged.eventDate || null,
    industries: JSON.stringify(merged.industries),
    sectors: merged.sectors,
    location: merged.location || null,
    compensationType: merged.compensationType || null,
    compensationAmount: merged.compensationAmount || null,
    compensationDetails: merged.compensationDetails || null,
    isRemote: merged.isRemote,
    isClosed: merged.isClosed,
    isRelevant,
    hasOpenCall: openCallAfterRead(merged.source, { isRelevant, hasOpenCall: merged.hasOpenCall }),
    // Closed and irrelevant rows score 0, so a later rescore keeps them hidden.
    qualityScore: computeQualityScore(merged),
    dateConfidence: serializeDateConfidence(merged.dateConfidence),
    enrichmentStatus: 'enriched',
    enrichedAt: now,
    enrichmentError: null,
    enrichmentClaimedAt: null,
    // The format is taken from the page only: a listing's one-line description does not say what kind of event it is.
    ...(pageRead ? { format: merged.format, verifiedAt: now, verificationError: null } : {}),
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

/**
 * The check could not be completed; record the error and move on so the queue
 * rotates. A search hit is not listed while its last check stands like this.
 */
export function buildVerificationErrorUpdate(error: string, now: Date = new Date()): Prisma.OpportunityUpdateInput {
  return {
    verifiedAt: now,
    verificationError: error,
    enrichmentClaimedAt: null,
  };
}
