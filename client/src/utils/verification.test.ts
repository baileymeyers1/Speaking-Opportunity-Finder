import { describe, it, expect } from 'vitest';
import { approximate, formatVerifiedAgo, isLowConfidence } from './verification';

const NOW = new Date('2026-11-02T15:00:00Z');

describe('formatVerifiedAgo', () => {
  it('returns null when never verified', () => {
    expect(formatVerifiedAgo({ verifiedAt: null }, NOW)).toBeNull();
    expect(formatVerifiedAgo({}, NOW)).toBeNull();
  });

  it('returns null when the last check failed', () => {
    expect(formatVerifiedAgo({ verifiedAt: '2026-11-01T10:00:00Z', verificationError: 'HTTP 503' }, NOW)).toBeNull();
  });

  it('says today for a check within the last day', () => {
    expect(formatVerifiedAgo({ verifiedAt: '2026-11-02T08:00:00Z' }, NOW)).toBe('Verified today');
  });

  it('counts whole days', () => {
    expect(formatVerifiedAgo({ verifiedAt: '2026-10-30T16:00:00Z' }, NOW)).toBe('Verified 2d ago');
    expect(formatVerifiedAgo({ verifiedAt: '2026-10-26T15:00:00Z' }, NOW)).toBe('Verified 7d ago');
  });

  it('ignores unparseable timestamps', () => {
    expect(formatVerifiedAgo({ verifiedAt: 'nope' }, NOW)).toBeNull();
  });
});

describe('isLowConfidence', () => {
  it('is true only for a low-confidence field', () => {
    const opportunity = { dateConfidence: { eventDate: 'low', cfpDeadline: 'high', location: 'medium' } as const };
    expect(isLowConfidence(opportunity, 'eventDate')).toBe(true);
    expect(isLowConfidence(opportunity, 'cfpDeadline')).toBe(false);
    expect(isLowConfidence({ dateConfidence: null }, 'eventDate')).toBe(false);
    expect(isLowConfidence({}, 'eventDate')).toBe(false);
  });
});

describe('approximate', () => {
  it('prefixes low-confidence labels with a tilde', () => {
    expect(approximate('Dec 1, 2026', true)).toBe('~Dec 1, 2026');
    expect(approximate('Dec 1, 2026', false)).toBe('Dec 1, 2026');
  });
});
