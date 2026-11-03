import { describe, it, expect } from 'vitest';
import { formatAge, formatDuration, formatRelative, percentOf } from './formatters';

const NOW = new Date('2026-11-03T12:00:00Z');

describe('formatAge', () => {
  it('picks seconds, minutes, hours or days', () => {
    expect(formatAge(12_000)).toBe('12s');
    expect(formatAge(5 * 60_000)).toBe('5m');
    expect(formatAge(26 * 3_600_000)).toBe('26h');
    expect(formatAge(9 * 86_400_000)).toBe('9d');
    expect(formatAge(-5)).toBe('0s');
  });
});

describe('formatRelative', () => {
  it('reads "never" for a missing stamp and "just now" inside 30s', () => {
    expect(formatRelative(null, NOW)).toBe('never');
    expect(formatRelative(new Date(NOW.getTime() - 10_000).toISOString(), NOW)).toBe('just now');
    expect(formatRelative(new Date(NOW.getTime() - 3_600_000).toISOString(), NOW)).toBe('1h ago');
  });
});

describe('formatDuration', () => {
  it('shows tenths of a second under a minute and minutes above', () => {
    expect(formatDuration(4_966)).toBe('5.0s');
    expect(formatDuration(72_000)).toBe('1m 12s');
    expect(formatDuration(null)).toBe('…');
  });
});

describe('percentOf', () => {
  it('rounds and survives an empty total', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBe(0);
  });
});
