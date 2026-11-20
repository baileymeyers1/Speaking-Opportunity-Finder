import type { LaneSummary } from '../types';
import { calendarDaysUntilDeadline } from './dates';

/**
 * Browse opens with one sentence computed from the list: what closes soon
 * under the filters in force. The numbers come from the server's lane summary.
 */

/** The headline as three runs. `accent` is the page's one phrase in red Fraunces italic. */
export interface SituationHeadline {
  lead: string;
  accent: string;
  tail: string;
}

export interface SituationNote {
  /** The call that closes first, as a link. */
  next: { id: string; title: string; when: string } | null;
  /** The sentence after it; empty when there is nothing to add. */
  rest: string;
}

const count = (value: number) => value.toLocaleString('en-US');
const callsClose = (value: number) => `${count(value)} ${value === 1 ? 'call closes' : 'calls close'}`;

export function situationHeadline(lanes: LaneSummary | undefined): SituationHeadline {
  // Before the first response (or on a list cached before lanes): the page's standing title.
  if (!lanes) return { lead: 'What closes ', accent: 'soon', tail: '' };
  if (lanes.closingWithin7 > 0) return { lead: `${callsClose(lanes.closingWithin7)} `, accent: 'within a week', tail: '.' };
  if (lanes.closingWithin30 > 0) return { lead: `${callsClose(lanes.closingWithin30)} `, accent: 'within a month', tail: '.' };
  if (lanes.counts.closing > 0) return { lead: 'Nothing closes ', accent: 'within a month', tail: '.' };
  if (lanes.counts.open + lanes.counts.watch > 0) return { lead: 'Nothing here has ', accent: 'a deadline', tail: '.' };
  return { lead: 'No calls ', accent: 'match', tail: '.' };
}

function whenItCloses(next: NonNullable<LaneSummary['nextToClose']>, now: Date): string {
  const days = calendarDaysUntilDeadline(next, now) ?? 0;
  if (days <= 0) return 'today';
  return days === 1 ? 'tomorrow' : `in ${count(days)} days`;
}

function otherLanes(lanes: LaneSummary): string {
  const { open, watch } = lanes.counts;
  const parts = [
    open > 0 ? `${count(open)} ${open === 1 ? 'call is' : 'calls are'} always open` : null,
    watch > 0 ? `${count(watch)} ${watch === 1 ? 'event has' : 'events have'} no call yet` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `${parts.join(' and ')}.` : 'Clear a filter, or run a live search for something new.';
}

/** The line under the headline. Null until the numbers arrive. */
export function situationNote(lanes: LaneSummary | undefined, now: Date = new Date()): SituationNote | null {
  if (!lanes) return null;
  if (!lanes.nextToClose) return { next: null, rest: otherLanes(lanes) };

  const next = { id: lanes.nextToClose.id, title: lanes.nextToClose.title, when: whenItCloses(lanes.nextToClose, now) };
  if (lanes.closingWithin7 > 0) {
    const more = lanes.closingWithin30 - lanes.closingWithin7;
    return { next, rest: more > 0 ? `Another ${count(more)} ${more === 1 ? 'closes' : 'close'} within a month.` : '' };
  }
  if (lanes.closingWithin30 > 0) {
    const later = lanes.counts.closing - lanes.closingWithin30;
    return { next, rest: later > 0 ? `${count(later)} more ${later === 1 ? 'closes' : 'close'} later.` : '' };
  }
  return { next, rest: '' };
}
