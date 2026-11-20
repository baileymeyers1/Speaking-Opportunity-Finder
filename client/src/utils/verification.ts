import type { Opportunity } from '../types';

export const LOW_CONFIDENCE_HINT =
  'Approximate: this date was inferred from weak cues on the event page. Check the page before relying on it.';

export function isLowConfidence(
  opportunity: Pick<Opportunity, 'dateConfidence'>,
  field: 'eventDate' | 'cfpDeadline'
): boolean {
  return opportunity.dateConfidence?.[field] === 'low';
}

/** Prefix a formatted date with "~" when its confidence is low. */
export function approximate(label: string, low: boolean): string {
  return low ? `~${label}` : label;
}
