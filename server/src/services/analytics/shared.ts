export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export interface LabelCount {
  label: string;
  count: number;
}

/** Count the strings in a list of JSON-encoded string arrays, most frequent first. */
export function countJsonArrayValues(encoded: string[], limit: number): LabelCount[] {
  const counts = new Map<string, number>();
  for (const json of encoded) {
    let values: unknown;
    try {
      values = JSON.parse(json);
    } catch {
      continue;
    }
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value !== 'string' || value.length === 0) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return topCounts(counts, limit);
}

/** Most frequent first; ties break alphabetically so the order is stable. */
export function topCounts(counts: Map<string, number>, limit: number): LabelCount[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}
