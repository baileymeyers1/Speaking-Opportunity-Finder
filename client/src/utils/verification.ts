import type { Opportunity } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const LOW_CONFIDENCE_HINT =
  'Approximate: this date was inferred from weak cues on the event page. Check the page before relying on it.';

/**
 * "Verified today" / "Verified 3d ago" for a listing whose last check
 * completed; null when it was never checked or the last check failed.
 */
export function formatVerifiedAgo(
  opportunity: Pick<Opportunity, 'verifiedAt' | 'verificationError'>,
  now: Date = new Date()
): string | null {
  if (!opportunity.verifiedAt || opportunity.verificationError) return null;
  const verified = new Date(opportunity.verifiedAt);
  if (isNaN(verified.getTime())) return null;
  const days = Math.floor((now.getTime() - verified.getTime()) / DAY_MS);
  if (days <= 0) return 'Verified today';
  return `Verified ${days}d ago`;
}

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
