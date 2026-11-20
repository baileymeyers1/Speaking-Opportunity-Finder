import type { Lane, LaneSummary } from 'shared';
import type { Prisma } from '../generated/prisma/client.js';
import { compareByClosing } from './opportunityQuery.js';

/**
 * Browse lists the catalogue in three lanes, because "what closes soon" only
 * has an answer for a call with a deadline:
 *  - closing: an open call with a deadline;
 *  - open:    an open call with none (it closes when its event starts, or never);
 *  - watch:   an event whose page was read and has no call for speakers yet.
 * A row nobody judged (`hasOpenCall` null) counts as an open call: it came from
 * a CFP listing, which vouches for it.
 */
export const LANES: readonly Lane[] = ['closing', 'open', 'watch'];

export function isLane(value: unknown): value is Lane {
  return typeof value === 'string' && (LANES as readonly string[]).includes(value);
}

/** The columns a row's lane, its place in the lane and the summary are read from. */
export interface LaneRow {
  id: string;
  cfpDeadline: Date | null;
  eventDate: Date | null;
  qualityScore: number | null;
  hasOpenCall: boolean | null;
}

export const LANE_ROW_SELECT = {
  id: true,
  cfpDeadline: true,
  eventDate: true,
  qualityScore: true,
  hasOpenCall: true,
} as const satisfies Prisma.OpportunitySelect;

export function laneOf(row: Pick<LaneRow, 'cfpDeadline' | 'hasOpenCall'>): Lane {
  if (row.hasOpenCall === false) return 'watch';
  return row.cfpDeadline ? 'closing' : 'open';
}

// Written as what stays in: `NOT { hasOpenCall: false }` drops the unjudged rows, because NOT of a NULL is NULL in SQL.
const CALL_NOT_RULED_OUT: Prisma.OpportunityWhereInput = { OR: [{ hasOpenCall: null }, { hasOpenCall: true }] };

/** `laneOf` as a Prisma condition. Keep the two in step. */
export function laneWhere(lane: Lane): Prisma.OpportunityWhereInput {
  switch (lane) {
    case 'watch':
      return { hasOpenCall: false };
    case 'closing':
      return { AND: [CALL_NOT_RULED_OUT, { cfpDeadline: { not: null } }] };
    case 'open':
      return { AND: [CALL_NOT_RULED_OUT, { cfpDeadline: null }] };
  }
}

/** Soonest event first, a row with no event date after every dated one; then the better row, then a stable order by id. */
export function compareByEvent(a: LaneRow, b: LaneRow): number {
  const eventA = a.eventDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const eventB = b.eventDate?.getTime() ?? Number.POSITIVE_INFINITY;
  if (eventA !== eventB) return eventA < eventB ? -1 : 1;
  return (b.qualityScore ?? 0) - (a.qualityScore ?? 0) || a.id.localeCompare(b.id);
}

/**
 * The order a lane is listed in by default. Closing, and a request that names
 * no lane, go by when the call closes. The other two have no deadline to go
 * by (a deadline stored on an event with no call means nothing), so they go by
 * the event: an open call stops being open the day its event starts.
 */
export function laneComparator(lane: Lane | undefined, now: Date): (a: LaneRow, b: LaneRow) => number {
  if (lane === 'open' || lane === 'watch') return compareByEvent;
  return (a, b) => compareByClosing(a, b, now);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lane counts and what closes soon, for rows that are already listed (future deadline or none). */
export function summarizeLanes(rows: readonly Pick<LaneRow, 'cfpDeadline' | 'hasOpenCall'>[], now: Date): LaneSummary {
  const summary: LaneSummary = { counts: { closing: 0, open: 0, watch: 0 }, closingWithin7: 0, closingWithin30: 0 };
  for (const row of rows) {
    const lane = laneOf(row);
    summary.counts[lane] += 1;
    if (lane !== 'closing' || !row.cfpDeadline) continue;
    const msLeft = row.cfpDeadline.getTime() - now.getTime();
    if (msLeft <= 7 * DAY_MS) summary.closingWithin7 += 1;
    if (msLeft <= 30 * DAY_MS) summary.closingWithin30 += 1;
  }
  return summary;
}
