import { describe, it, expect } from 'vitest';
import { compareByClosing, effectiveClosing, ROLLING_CALL_HORIZON_DAYS, sortsByClosing, type ClosingSortRow } from './opportunityQuery.js';

const NOW = new Date('2026-11-19T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

function row(id: string, overrides: Partial<ClosingSortRow> = {}): ClosingSortRow {
  return { id, cfpDeadline: null, eventDate: null, qualityScore: 50, ...overrides };
}

describe('effectiveClosing', () => {
  it('is the deadline when there is one, whatever the event date', () => {
    expect(effectiveClosing(row('a', { cfpDeadline: inDays(5), eventDate: inDays(90) }), NOW)).toEqual(inDays(5));
  });

  it('is the day the event starts when there is no deadline', () => {
    expect(effectiveClosing(row('a', { eventDate: inDays(12) }), NOW)).toEqual(inDays(12));
  });

  it('is a month out for a rolling call with neither date', () => {
    expect(ROLLING_CALL_HORIZON_DAYS).toBe(30);
    expect(effectiveClosing(row('a'), NOW)).toEqual(inDays(30));
  });
});

describe('compareByClosing', () => {
  it('puts rows without a deadline where they close, not after everything else', () => {
    const rows = [
      row('late', { cfpDeadline: inDays(45) }),
      row('rolling-podcast'),
      row('far-event', { eventDate: inDays(60) }),
      row('soon', { cfpDeadline: inDays(5) }),
      row('event-next-week', { eventDate: inDays(12) }),
      row('this-month', { cfpDeadline: inDays(20) }),
    ];
    expect(rows.sort((a, b) => compareByClosing(a, b, NOW)).map((r) => r.id)).toEqual([
      'soon',
      'event-next-week',
      'this-month',
      'rolling-podcast',
      'late',
      'far-event',
    ]);
  });

  it('orders rows that close together by quality, then by id, so pages never shuffle', () => {
    const rows = [row('b', { qualityScore: 40 }), row('c', { qualityScore: 90 }), row('a', { qualityScore: 40 }), row('d', { qualityScore: null })];
    expect(rows.sort((x, y) => compareByClosing(x, y, NOW)).map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('sortsByClosing', () => {
  it('is the default and the deadline sort, nothing else', () => {
    expect(sortsByClosing(undefined)).toBe(true);
    expect(sortsByClosing('deadline')).toBe(true);
    expect(sortsByClosing('quality')).toBe(false);
    expect(sortsByClosing('eventDate')).toBe(false);
    expect(sortsByClosing('match')).toBe(false);
  });
});
