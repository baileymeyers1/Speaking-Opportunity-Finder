import type { Prisma } from '../generated/prisma/client.js';
import { buildOpportunityWhere } from './opportunityQuery.js';
import { LIVE_SEARCH_SOURCE } from './searchSources.js';

/**
 * Which stored rows the daily sync deletes. Rows a user has saved are never
 * deleted: that would cascade to their saved calls. They stay, hidden from
 * Browse by the deadline rule.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A row stored before deadlines carried a zone holds midnight UTC of its
 * closing day, which under the AoE reading stays open until 11:59:59 UTC the
 * next day: 36 hours later. Deleting only what closed at least that long ago
 * never removes a call that is still open anywhere on Earth, whichever shape
 * the row has (see lib/deadlines.ts and scripts/shiftLegacyDeadlines.ts).
 */
export const EXPIRED_GRACE_MS = 36 * 60 * 60 * 1000;

/** How long a live-search page that led nowhere is kept before a later search may read it again. */
export const DEAD_LIVE_HIT_DAYS = 30;

const NOT_SAVED: Prisma.OpportunityWhereInput = { savedBy: { none: {} } };

/** Rows from any source, live search included, whose deadline closed at least `EXPIRED_GRACE_MS` ago. */
export function expiredRowsWhere(now: Date): Prisma.OpportunityWhereInput {
  return { cfpDeadline: { lt: new Date(now.getTime() - EXPIRED_GRACE_MS) }, ...NOT_SAVED };
}

/**
 * Live-search rows that are not listed (closed, not an event, past, or never
 * readable) and were found more than `DEAD_LIVE_HIT_DAYS` ago. A listed live
 * row is a read a search paid for: it stays until its deadline passes, like
 * any other row. A dead end is dropped so that a later search reads the page
 * afresh: next year's call often goes up at the same address. The worker
 * stops retrying an unreadable hit after the same 30 days.
 *
 * Rows for which the listing rule evaluates to NULL in SQL are neither listed
 * nor matched here, so they are kept.
 */
export function deadLiveHitsWhere(now: Date): Prisma.OpportunityWhereInput {
  return {
    source: { startsWith: LIVE_SEARCH_SOURCE },
    createdAt: { lt: new Date(now.getTime() - DEAD_LIVE_HIT_DAYS * DAY_MS) },
    ...NOT_SAVED,
    NOT: buildOpportunityWhere({}, now),
  };
}
