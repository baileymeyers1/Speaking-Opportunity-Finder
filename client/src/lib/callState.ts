import type { Opportunity } from '../types';
import { calendarDaysUntilDeadline, isDeadlinePast } from './dates';
import { isLowConfidence } from '../utils/verification';

/**
 * Where a call stands, which is what a row on Browse leads with. The same
 * three states as the server's lanes (server/src/services/lanes.ts), read from
 * one row, plus `closed` for a row seen after its deadline (a saved call, a
 * stale cache).
 */
export type CallFields = Pick<Opportunity, 'cfpDeadline' | 'deadlineTimezone' | 'dateConfidence' | 'eventDate' | 'hasOpenCall'>;

export type CallState =
  | { kind: 'closing'; daysLeft: number; approximate: boolean; urgent: boolean }
  /** An open call with no deadline: open until its event starts (`until`), or all year. */
  | { kind: 'open'; until: string | null }
  /** An event whose page has no call for speakers yet. */
  | { kind: 'watch' }
  | { kind: 'closed' };

/** A call this close gets the "look here" colour. */
export const URGENT_WITHIN_DAYS = 7;

export function callState(call: CallFields, now: Date = new Date()): CallState {
  if (call.hasOpenCall === false) return { kind: 'watch' };
  if (!call.cfpDeadline) return { kind: 'open', until: call.eventDate ?? null };
  if (isDeadlinePast(call, now)) return { kind: 'closed' };

  const daysLeft = Math.max(0, calendarDaysUntilDeadline(call, now) ?? 0);
  const approximate = isLowConfidence(call, 'cfpDeadline');
  // An approximate date was inferred from weak cues on the page: it is shown, marked, and never raises the alarm.
  return { kind: 'closing', daysLeft, approximate, urgent: !approximate && daysLeft <= URGENT_WITHIN_DAYS };
}

const MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };

/** The row's leading cell: a figure over its unit. */
export function countdownText(state: CallState): { figure: string; unit: string } {
  switch (state.kind) {
    case 'closing':
      if (state.daysLeft === 0) return { figure: 'Today', unit: 'last day' };
      return { figure: `${state.approximate ? '~' : ''}${state.daysLeft}`, unit: state.daysLeft === 1 ? 'day left' : 'days left' };
    case 'open': {
      const until = state.until ? new Date(state.until) : null;
      const dated = until && !Number.isNaN(until.getTime());
      return { figure: 'Open', unit: dated ? `until ${until.toLocaleDateString('en-US', MONTH_DAY)}` : 'all year' };
    }
    case 'watch':
      return { figure: 'No call', unit: 'yet' };
    case 'closed':
      return { figure: 'Closed', unit: '' };
  }
}
