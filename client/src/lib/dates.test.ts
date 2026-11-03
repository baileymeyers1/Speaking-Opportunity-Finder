import { describe, expect, it } from 'vitest';
import { daysUntil, formatDate, isPastDate } from './dates';

describe('formatDate', () => {
  it('formats a UTC-midnight date on its own calendar day regardless of zone', () => {
    // Runs under TZ=America/Los_Angeles (see vitest config): local time would say Nov 13.
    expect(formatDate('2026-11-14T00:00:00.000Z')).toBe('Nov 14, 2026');
    expect(formatDate('2026-11-14T00:00:00.000Z', 'long')).toBe('Saturday, November 14, 2026');
  });

  it('returns null for missing or invalid input', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate('not a date')).toBeNull();
  });
});

describe('daysUntil / isPastDate', () => {
  it('counts whole days from a fixed now', () => {
    const now = new Date('2026-11-01T12:00:00.000Z');
    expect(daysUntil('2026-11-04T00:00:00.000Z', now)).toBe(3);
    expect(daysUntil('2026-10-31T00:00:00.000Z', now)).toBe(-1);
  });

  it('treats only earlier dates as past', () => {
    const now = new Date('2026-11-01T12:00:00.000Z');
    expect(isPastDate('2026-10-31T00:00:00.000Z', now)).toBe(true);
    expect(isPastDate('2026-11-02T00:00:00.000Z', now)).toBe(false);
    expect(isPastDate(null, now)).toBe(false);
  });
});
