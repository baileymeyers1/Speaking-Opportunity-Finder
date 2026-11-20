import type { Lane, LaneSummary } from '../types';

const count = (value: number) => value.toLocaleString('en-US');
const close = (value: number) => `${count(value)} ${value === 1 ? 'closes' : 'close'}`;

/**
 * The quiet line beside Browse's lane switch. For the closing lane it answers
 * "what closes soon" under the filters in force; for the other two it says
 * what the lane holds. Empty for an empty lane (the list explains that) and
 * until the first response.
 */
export function laneCaption(lane: Lane, lanes: LaneSummary | undefined): string {
  if (!lanes || lanes.counts[lane] === 0) return '';
  switch (lane) {
    case 'closing':
      if (lanes.closingWithin7 > 0) return `${close(lanes.closingWithin7)} within a week`;
      if (lanes.closingWithin30 > 0) return `${close(lanes.closingWithin30)} within a month`;
      return 'None close within a month';
    case 'open':
      return 'No stated deadline: open until the event, or all year';
    case 'watch':
      return 'Events with no call for speakers yet';
  }
}
