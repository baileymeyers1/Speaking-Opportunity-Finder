import type { SavedCategory, SavedOpportunity } from '../types';
import { callState } from './callState';

/**
 * The Saved page is a pipeline in four stages. Each stage is its own working
 * list: what you are interested in is ordered by what closes first, the rest
 * by the event, because once you have applied the deadline no longer matters.
 */
export const SAVED_STAGES: readonly SavedCategory[] = ['interested', 'applied', 'accepted', 'rejected'];

export const DEFAULT_STAGE: SavedCategory = 'interested';

export const STAGE_LABELS: Record<SavedCategory, string> = {
  interested: 'Interested',
  applied: 'Applied',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export function isStage(value: unknown): value is SavedCategory {
  return typeof value === 'string' && (SAVED_STAGES as readonly string[]).includes(value);
}

/** A saved call with its call still attached; one whose call was deleted has nothing to show. */
export type SavedCall = SavedOpportunity & { opportunity: NonNullable<SavedOpportunity['opportunity']> };

const hasCall = (item: SavedOpportunity): item is SavedCall => Boolean(item.opportunity);

export function countByStage(items: readonly SavedOpportunity[]): Record<SavedCategory, number> {
  const counts: Record<SavedCategory, number> = { interested: 0, applied: 0, accepted: 0, rejected: 0 };
  for (const item of items) {
    if (hasCall(item) && isStage(item.category)) counts[item.category] += 1;
  }
  return counts;
}

const FAR = Number.MAX_SAFE_INTEGER;
const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? null : value;
};

/** Sort keys for a call you have not applied to yet: [band, when]. Bands: closing, open, no call, closed. */
function interestedKey(item: SavedCall, now: Date): [number, number] {
  const state = callState(item.opportunity, now);
  switch (state.kind) {
    case 'closing':
      return [0, time(item.opportunity.cfpDeadline) ?? FAR];
    case 'open':
      return [1, time(item.opportunity.eventDate) ?? FAR];
    case 'watch':
      return [2, time(item.opportunity.eventDate) ?? FAR];
    case 'closed':
      return [3, -(time(item.opportunity.cfpDeadline) ?? 0)];
  }
}

/** Sort keys once a call is applied to: the next event first, undated ones after, past ones last (most recent first). */
function eventKey(item: SavedCall, now: Date): [number, number] {
  const event = time(item.opportunity.eventDate);
  if (event === null) return [1, 0];
  return event >= startOfLocalDay(now) ? [0, event] : [2, -event];
}

/** The calls saved in one stage, in the order that stage is worked in. */
export function savedInStage(items: readonly SavedOpportunity[], stage: SavedCategory, now: Date = new Date()): SavedCall[] {
  const key = stage === 'interested' ? interestedKey : eventKey;
  return items
    .filter(hasCall)
    .filter((item) => item.category === stage)
    .map((item) => ({ item, key: key(item, now) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.item.id.localeCompare(b.item.id))
    .map((entry) => entry.item);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight today on the viewer's calendar, as the UTC instant an event date on that day is stored as. */
function startOfLocalDay(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * What a row leads with once you have applied: days until the event. An event
 * date is a calendar day (stored as UTC midnight), so the days are counted
 * from the viewer's own calendar day.
 */
export function eventCountdownText(eventDate: string | null | undefined, now: Date = new Date()): { figure: string; unit: string } {
  const event = time(eventDate);
  if (event === null) return { figure: 'No date', unit: 'yet' };
  const days = Math.round((event - startOfLocalDay(now)) / DAY_MS);
  if (days < 0) return { figure: 'Past', unit: 'event held' };
  if (days === 0) return { figure: 'Today', unit: 'event day' };
  return { figure: String(days), unit: days === 1 ? 'day to event' : 'days to event' };
}

/** How close a deadline counts as "soon" on the caption. */
const SOON_DAYS = 7;

/** The quiet line beside the stage switch: for the calls you have yet to apply to, how many close within a week. */
export function stageCaption(stage: SavedCategory, itemsInStage: readonly SavedOpportunity[], now: Date = new Date()): string {
  if (stage !== 'interested') return '';
  const closing = itemsInStage
    .filter(hasCall)
    .map((item) => callState(item.opportunity, now))
    .filter((state) => state.kind === 'closing');
  if (closing.length === 0) return '';
  const soon = closing.filter((state) => state.kind === 'closing' && state.daysLeft <= SOON_DAYS).length;
  if (soon === 0) return 'None close within a week';
  return `${soon.toLocaleString('en-US')} ${soon === 1 ? 'closes' : 'close'} within a week`;
}
