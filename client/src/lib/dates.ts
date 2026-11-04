/**
 * Event dates and verification stamps are stored as UTC midnight. Formatting
 * them in the viewer's local zone shows the previous day anywhere west of
 * Greenwich, so they are always formatted in UTC.
 *
 * Deadlines are different: each is an instant with a zone of its own. Their
 * helpers come from the server's pure deadline module, imported by path
 * because the server build cannot consume runtime code from `shared/`, so the
 * card, the detail page and the API share one definition of "closed".
 */
export {
  daysUntilDeadline,
  describeDeadline,
  formatDeadline,
  isDeadlinePast,
  type DeadlineFields,
  type FormattedDeadline,
} from '../../../server/src/lib/deadlines';

const SHORT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
const LONG: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
};

/** Format an ISO date string for display; returns null for missing dates. */
export function formatDate(dateString: string | null | undefined, style: 'short' | 'long' = 'short'): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', style === 'long' ? LONG : SHORT);
}
