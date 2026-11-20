import type { Opportunity } from '../types';
import { callState, type CallFields } from './callState';
import { formatDate, formatDeadline } from './dates';
import { LOW_CONFIDENCE_HINT } from '../utils/verification';

/**
 * The words beside the days-left figure on the call page: when the call
 * closes (in its own zone, then on the viewer's clock), or why there is no
 * date to give.
 */
export interface CallStanding {
  lead: string;
  /** The line under the lead; null when there is nothing to add. */
  detail: string | null;
  /** Caveats about the date itself. */
  notes: string[];
}

export const ZONE_ASSUMED_NOTE = 'Time zone not stated; read as Anywhere on Earth (UTC-12).';

const NO_CALL_DETAIL =
  'We read this event\'s page and found no call for speakers. Contact the organizer to pitch a talk, or check back: listed events are re-checked weekly.';

export function callStanding(call: CallFields, now: Date = new Date(), viewerZone?: string | null): CallStanding {
  const state = callState(call, now);

  if (state.kind === 'watch') return { lead: 'No call for speakers yet', detail: NO_CALL_DETAIL, notes: [] };

  if (state.kind === 'open') {
    const until = formatDate(state.until, 'long');
    return {
      lead: 'No deadline is stated',
      detail: until ? `Open until the event starts on ${until}.` : 'Open all year.',
      notes: [],
    };
  }

  const deadline = formatDeadline(call, { style: 'long', viewerZone });
  if (!deadline) return { lead: 'No deadline is stated', detail: null, notes: [] };
  if (state.kind === 'closed') return { lead: `Closed ${deadline.date}`, detail: null, notes: [] };

  // An inferred date is given as a day, without a time it never had.
  if (state.approximate) return { lead: `Closes around ${deadline.date}`, detail: null, notes: [LOW_CONFIDENCE_HINT] };

  return {
    lead: `Closes ${deadline.date}, ${deadline.time}`,
    detail: deadline.viewerTime ? `${deadline.viewerTime} your time` : null,
    notes: deadline.zoneAssumed ? [ZONE_ASSUMED_NOTE] : [],
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday" or "3 days ago" since the listing was last checked against its page; null when it was not, or the check failed. */
export function checkedAgo(opportunity: Pick<Opportunity, 'verifiedAt' | 'verificationError'>, now: Date = new Date()): string | null {
  if (!opportunity.verifiedAt || opportunity.verificationError) return null;
  const checked = new Date(opportunity.verifiedAt);
  if (Number.isNaN(checked.getTime())) return null;
  const days = Math.floor((now.getTime() - checked.getTime()) / DAY_MS);
  if (days <= 0) return 'Today';
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
