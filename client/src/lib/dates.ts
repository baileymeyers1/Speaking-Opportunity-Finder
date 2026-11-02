const SHORT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const LONG: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };

/** Format an ISO date string for display; returns null for missing dates. */
export function formatDate(dateString: string | null | undefined, style: 'short' | 'long' = 'short'): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', style === 'long' ? LONG : SHORT);
}

/** Whole days from now until the date; negative when it has passed. */
export function daysUntil(dateString: string, now: Date = new Date()): number {
  return Math.ceil((new Date(dateString).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isPastDate(dateString: string | null | undefined, now: Date = new Date()): boolean {
  return Boolean(dateString) && new Date(dateString!) < now;
}
