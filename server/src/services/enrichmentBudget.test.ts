import { describe, it, expect } from 'vitest';
import { utcDateKey, isClaimStale, CLAIM_STALE_MS, parseDailyLimit } from './enrichmentBudget.js';

describe('utcDateKey', () => {
  it('uses the UTC calendar day', () => {
    expect(utcDateKey(new Date('2026-03-16T00:00:01Z'))).toBe('2026-03-16');
    expect(utcDateKey(new Date('2026-03-15T23:59:59Z'))).toBe('2026-03-15');
  });

  it('is stable within a day so the counter accumulates', () => {
    expect(utcDateKey(new Date('2026-03-16T08:00:00Z'))).toBe(utcDateKey(new Date('2026-03-16T20:00:00Z')));
  });
});

describe('isClaimStale', () => {
  const now = new Date('2026-11-02T12:00:00Z');

  it('treats an unclaimed row as claimable', () => {
    expect(isClaimStale(null, now)).toBe(true);
  });

  it('treats a fresh claim as held', () => {
    expect(isClaimStale(new Date(now.getTime() - 1000), now)).toBe(false);
  });

  it('treats a claim older than the stale window as abandoned', () => {
    expect(isClaimStale(new Date(now.getTime() - CLAIM_STALE_MS - 1), now)).toBe(true);
  });
});

describe('parseDailyLimit', () => {
  it('falls back to the default when unset or blank', () => {
    expect(parseDailyLimit(undefined)).toBe(600);
    expect(parseDailyLimit('   ')).toBe(600);
  });

  it('accepts a positive integer', () => {
    expect(parseDailyLimit('250')).toBe(250);
  });

  it('rejects zero, negatives, fractions and junk', () => {
    expect(parseDailyLimit('0')).toBe(600);
    expect(parseDailyLimit('-5')).toBe(600);
    expect(parseDailyLimit('12.5')).toBe(600);
    expect(parseDailyLimit('lots')).toBe(600);
  });
});
