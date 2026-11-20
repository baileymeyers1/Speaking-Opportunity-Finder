import { describe, it, expect } from 'vitest';
import { approximate, isLowConfidence } from './verification';

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
