import type { Opportunity, PreviousEdition } from '../types';

/**
 * Text for the canonical-event hints on a card: which other sources list the
 * same call, and when last year's call showed up.
 */

const SOURCE_LABELS: Record<string, string> = {
  'confs.tech': 'confs.tech',
  'javaconferences.org': 'Java Conferences',
  'callingallpapers.com': 'Calling All Papers',
  'developers.events': 'developers.events',
  'pretalx.com': 'Pretalx',
  'sessionize.com': 'Sessionize',
  'wikicfp.com': 'WikiCFP',
  'conferencealerts.com': 'Conference Alerts',
  linkup: 'web search',
  'Live Search': 'live search',
};

/** A readable name for a source id; the id itself when it has no label. */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** "Also on WikiCFP, Pretalx"; null when nothing else lists the call. */
export function alsoListedOnText(sources: string[] | undefined): string | null {
  if (!sources || sources.length === 0) return null;
  return `Also on ${sources.map(sourceLabel).join(', ')}`;
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };

function dayMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-GB', DAY_MONTH);
}

export interface PreviousEditionHint {
  /** "Last year's CFP opened around 12 Mar" / "The 2025 CFP closed 1 Dec". */
  text: string;
  /** The longer explanation for the tooltip. */
  detail: string;
}

/**
 * The hint for the most recent earlier edition. "Opened around" is when that
 * call was first stored here, the closest thing to its opening date; when the
 * edition was stored only after its deadline, the deadline is shown instead.
 */
export function previousEditionHint(
  opportunity: Pick<Opportunity, 'editionYear' | 'previousEditions'>,
  now: Date = new Date()
): PreviousEditionHint | null {
  const previous = opportunity.previousEditions?.[0];
  if (!previous) return null;
  const thisYear = opportunity.editionYear ?? now.getUTCFullYear();
  const who = previous.year === thisYear - 1 ? "Last year's CFP" : `The ${previous.year} CFP`;
  const firstSeen = dayMonth(previous.firstSeenAt);
  const deadline = dayMonth(previous.cfpDeadline);
  const storedAfterDeadline =
    previous.cfpDeadline !== null && new Date(previous.firstSeenAt).getTime() > new Date(previous.cfpDeadline).getTime();
  if (firstSeen && !storedAfterDeadline) {
    return {
      text: `${who} opened around ${firstSeen}`,
      detail: `The ${previous.year} call was first listed here on ${firstSeen}${deadline ? ` and closed ${deadline}` : ''}. Next year's call often follows the same rhythm.`,
    };
  }
  if (deadline) {
    return {
      text: `${who} closed ${deadline}`,
      detail: `The ${previous.year} call closed on ${deadline}. Next year's call often follows the same rhythm.`,
    };
  }
  return null;
}

export type { PreviousEdition };
