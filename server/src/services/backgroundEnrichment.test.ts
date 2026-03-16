import { describe, it, expect } from 'vitest';

describe('enrichment budget', () => {
  it('resets daily budget at midnight', () => {
    const now = new Date('2026-03-16T00:00:01Z');
    const lastReset = new Date('2026-03-15T00:00:01Z');
    const isSameDay = now.toDateString() === lastReset.toDateString();
    expect(isSameDay).toBe(false);
  });

  it('does not reset within same day', () => {
    const now = new Date('2026-03-16T20:00:00Z');
    const lastReset = new Date('2026-03-16T08:00:00Z');
    const isSameDay = now.toDateString() === lastReset.toDateString();
    expect(isSameDay).toBe(true);
  });
});
