import type { Opportunity } from '../types';

/** How a call's own facts are worded, the same on a Browse row and on the call page. */

/** The organization, unless it only repeats the title (a scraper often has nothing else to put there). */
/** Where Apply goes: the call's own page when it is not the event's page, else the event's page. */
export function applyHref(opportunity: Pick<Opportunity, 'applyUrl' | 'callUrl' | 'hasOpenCall'>): string {
  return opportunity.hasOpenCall !== false && opportunity.callUrl ? opportunity.callUrl : opportunity.applyUrl;
}

export function organizationLabel(opportunity: Pick<Opportunity, 'organization' | 'title'>): string | null {
  const organization = (opportunity.organization ?? '').trim();
  if (!organization || organization.toLowerCase() === opportunity.title.trim().toLowerCase()) return null;
  return organization;
}

/** "Englewood, CO", "Turin, Italy, or remote", "Remote"; null when the page gave no place. */
export function whereLabel(opportunity: Pick<Opportunity, 'location' | 'isRemote'>): string | null {
  if (!opportunity.isRemote) return opportunity.location;
  return opportunity.location ? `${opportunity.location}, or remote` : 'Remote';
}

/** "paid, $1,500", "travel"; null when the page states no pay. */
export function payLabel(opportunity: Pick<Opportunity, 'compensationType' | 'compensationAmount'>): string | null {
  if (!opportunity.compensationType) return null;
  return opportunity.compensationAmount
    ? `${opportunity.compensationType}, $${opportunity.compensationAmount.toLocaleString('en-US')}`
    : opportunity.compensationType;
}

/**
 * A description as plain prose. Pages read through the reader arrive as
 * Markdown, so a heading line can start with "#" and a phrase can sit inside
 * "**"; shown raw they look like a fault. Line breaks are kept.
 */
export function plainDescription(description: string): string {
  return description
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
