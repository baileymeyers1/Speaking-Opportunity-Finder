import { describe, it, expect } from 'vitest';
import { compareByEvent, isLane, laneComparator, laneOf, laneWhere, summarizeLanes, type LaneRow } from './lanes.js';

const NOW = new Date('2026-11-20T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

function row(id: string, overrides: Partial<LaneRow> = {}): LaneRow {
  return { id, cfpDeadline: null, eventDate: null, qualityScore: 50, hasOpenCall: true, ...overrides };
}

describe('laneOf', () => {
  it('is closing for a call with a deadline', () => {
    expect(laneOf(row('a', { cfpDeadline: inDays(5) }))).toBe('closing');
  });

  it('is open for a call with no deadline, with or without an event date', () => {
    expect(laneOf(row('a', { eventDate: inDays(40) }))).toBe('open');
    expect(laneOf(row('b'))).toBe('open');
  });

  it('is watch when the page was read and has no call, even if a deadline was stored', () => {
    expect(laneOf(row('a', { hasOpenCall: false }))).toBe('watch');
    expect(laneOf(row('b', { hasOpenCall: false, cfpDeadline: inDays(5) }))).toBe('watch');
  });

  it('treats a row nobody judged as an open call: a listing vouches for it', () => {
    expect(laneOf(row('a', { hasOpenCall: null, cfpDeadline: inDays(5) }))).toBe('closing');
    expect(laneOf(row('b', { hasOpenCall: null }))).toBe('open');
  });
});

describe('laneWhere', () => {
  it('names the unjudged rows outright, because NOT of a NULL drops them in SQL', () => {
    const notRuledOut = { OR: [{ hasOpenCall: null }, { hasOpenCall: true }] };
    expect(laneWhere('closing')).toEqual({ AND: [notRuledOut, { cfpDeadline: { not: null } }] });
    expect(laneWhere('open')).toEqual({ AND: [notRuledOut, { cfpDeadline: null }] });
    expect(laneWhere('watch')).toEqual({ hasOpenCall: false });
  });
});

describe('isLane', () => {
  it('accepts the three lanes and nothing else', () => {
    expect(['closing', 'open', 'watch'].every(isLane)).toBe(true);
    expect([undefined, '', 'all', 'Closing', 3].some(isLane)).toBe(false);
  });
});

describe('compareByEvent', () => {
  it('lists the soonest event first and a row with no event date after every dated one', () => {
    const rows = [row('rolling'), row('far', { eventDate: inDays(90) }), row('soon', { eventDate: inDays(9) })];
    expect(rows.sort(compareByEvent).map((r) => r.id)).toEqual(['soon', 'far', 'rolling']);
  });

  it('orders rows without a date by quality, then by id, so pages never shuffle', () => {
    const rows = [row('b'), row('c', { qualityScore: 80 }), row('a')];
    expect(rows.sort(compareByEvent).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('laneComparator', () => {
  it('orders the closing lane, and a request with no lane, by when a call closes', () => {
    const rows = () => [row('late', { cfpDeadline: inDays(40) }), row('soon', { cfpDeadline: inDays(4) })];
    expect(rows().sort(laneComparator('closing', NOW)).map((r) => r.id)).toEqual(['soon', 'late']);
    expect(rows().sort(laneComparator(undefined, NOW)).map((r) => r.id)).toEqual(['soon', 'late']);
  });

  it('orders the other two lanes by event date: a stored deadline means nothing there', () => {
    const rows = () => [
      row('deadline-but-late-event', { hasOpenCall: false, cfpDeadline: inDays(2), eventDate: inDays(80) }),
      row('early-event', { hasOpenCall: false, eventDate: inDays(10) }),
    ];
    expect(rows().sort(laneComparator('watch', NOW)).map((r) => r.id)).toEqual(['early-event', 'deadline-but-late-event']);
    expect(rows().sort(laneComparator('open', NOW)).map((r) => r.id)).toEqual(['early-event', 'deadline-but-late-event']);
  });
});

describe('summarizeLanes', () => {
  const rows = [
    row('today', { cfpDeadline: inDays(0.2) }),
    row('this-week', { cfpDeadline: inDays(6.9) }),
    row('just-past-a-week', { cfpDeadline: inDays(7.1) }),
    row('this-month', { cfpDeadline: inDays(29) }),
    row('later', { cfpDeadline: inDays(120), hasOpenCall: null }),
    row('open-until-event', { eventDate: inDays(30) }),
    row('rolling'),
    row('no-call', { hasOpenCall: false, cfpDeadline: inDays(1) }),
  ];

  it('counts each lane', () => {
    expect(summarizeLanes(rows, NOW).counts).toEqual({ closing: 5, open: 2, watch: 1 });
  });

  it('counts what closes within 7 and within 30 days, the 30 including the 7', () => {
    const summary = summarizeLanes(rows, NOW);
    expect(summary.closingWithin7).toBe(2);
    expect(summary.closingWithin30).toBe(4);
  });

  it('never counts an event with no call as closing soon, whatever deadline it stores', () => {
    const onlyNoCall = [row('no-call', { hasOpenCall: false, cfpDeadline: inDays(1) })];
    expect(summarizeLanes(onlyNoCall, NOW)).toEqual({
      counts: { closing: 0, open: 0, watch: 1 },
      closingWithin7: 0,
      closingWithin30: 0,
    });
  });

  it('is all zeros when no row matches', () => {
    expect(summarizeLanes([], NOW)).toEqual({
      counts: { closing: 0, open: 0, watch: 0 },
      closingWithin7: 0,
      closingWithin30: 0,
    });
  });
});
