import { describe, expect, it } from 'vitest';
import { describeDeadline, formatDeadline, formatDate, isDeadlinePast } from './dates';

// The suite runs under TZ=America/Los_Angeles (see vitest config), so `new Date(y, m, d, h)` is Pacific time.

describe('formatDate', () => {
  it('formats a UTC-midnight date on its own calendar day regardless of zone', () => {
    // Local time would say Nov 13.
    expect(formatDate('2026-11-14T00:00:00.000Z')).toBe('Nov 14, 2026');
    expect(formatDate('2026-11-14T00:00:00.000Z', 'long')).toBe('Saturday, November 14, 2026');
  });

  it('returns null for missing or invalid input', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate('not a date')).toBeNull();
  });
});

describe('deadlines in the viewer zone', () => {
  const elevenPmPacificNov30 = new Date(2026, 10, 30, 23, 0, 0);
  const fourAmPacificDec1 = new Date(2026, 11, 1, 4, 0, 0);
  const aoe = { cfpDeadline: '2026-12-01T11:59:59.000Z', deadlineTimezone: 'AoE' };
  const legacy = { cfpDeadline: '2026-11-30T00:00:00.000Z', deadlineTimezone: null };

  it('keeps a deadline "today" in AoE open at 11 PM Pacific', () => {
    expect(isDeadlinePast(aoe, elevenPmPacificNov30)).toBe(false);
    expect(isDeadlinePast(legacy, elevenPmPacificNov30)).toBe(false);
    expect(isDeadlinePast(aoe, fourAmPacificDec1)).toBe(true);
    expect(isDeadlinePast(legacy, fourAmPacificDec1)).toBe(true);
    expect(isDeadlinePast({ cfpDeadline: null }, fourAmPacificDec1)).toBe(false);
  });

  it('shows the deadline on its own calendar and converts it to Pacific time by default', () => {
    expect(formatDeadline(aoe)?.full).toBe('Nov 30, 2026, 11:59 PM AoE · Dec 1, 3:59 AM your time');
    expect(formatDeadline(aoe, { style: 'long' })?.date).toBe('Monday, November 30, 2026');
    expect(formatDeadline(legacy)?.zoneAssumed).toBe(true);
    expect(formatDeadline({ cfpDeadline: '2026-12-01T04:59:59.000Z', deadlineTimezone: 'America/New_York' })?.full).toBe(
      'Nov 30, 2026, 11:59 PM EST · 8:59 PM your time'
    );
  });

  it('describes a deadline that is still today in AoE as closing today', () => {
    expect(describeDeadline(aoe, elevenPmPacificNov30)).toBe('closes today (11:59 PM AoE · Dec 1, 3:59 AM your time)');
    expect(describeDeadline(aoe, fourAmPacificDec1)).toBe('closed Nov 30, 2026 (11:59 PM AoE · Dec 1, 3:59 AM your time)');
  });
});
