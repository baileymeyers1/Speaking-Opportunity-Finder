const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A duration as the largest sensible unit: "45s", "3m", "5h", "2d". Negative values read as zero. */
export function formatAge(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < MINUTE_MS) return `${Math.round(safe / 1000)}s`;
  if (safe < HOUR_MS) return `${Math.round(safe / MINUTE_MS)}m`;
  if (safe < 2 * DAY_MS) return `${Math.round(safe / HOUR_MS)}h`;
  return `${Math.round(safe / DAY_MS)}d`;
}

/** "3m ago" / "never" for an ISO timestamp. */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never';
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 30 * 1000) return 'just now';
  return `${formatAge(ms)} ago`;
}

/** "4.9s" / "1m 12s" for a run duration. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '…';
  if (ms < MINUTE_MS) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / MINUTE_MS);
  const seconds = Math.round((ms % MINUTE_MS) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Whole-number percentage of a part in a total; 0 for an empty total. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}
