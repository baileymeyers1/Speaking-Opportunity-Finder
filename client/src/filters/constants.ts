import type { CompensationType, OpportunityFormat, SortBy } from '../types';

export const OPPORTUNITY_FORMATS: readonly OpportunityFormat[] = [
  'conference',
  'meetup',
  'podcast',
  'webinar',
  'workshop',
  'panel',
  'other',
];

export const COMPENSATION_TYPES: readonly CompensationType[] = [
  'paid',
  'travel',
  'exposure',
  'honorarium',
];

/** `match` only ranks for a signed-in user with a speaker profile; the server falls back to quality otherwise. */
export const SORT_OPTIONS: readonly SortBy[] = ['deadline', 'eventDate', 'quality', 'match'];

export const DEFAULT_SORT: SortBy = 'deadline';

/** Upper bound of the compensation sliders; a max at this value means "no upper bound". */
export const COMPENSATION_MAX = 2000;

/** Delay before a typed search term is written to the URL. */
export const SEARCH_DEBOUNCE_MS = 400;
