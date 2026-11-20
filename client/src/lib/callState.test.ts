import { describe, expect, it } from 'vitest';
import { callState, countdownText, type CallFields } from './callState';

const NOW = new Date('2026-11-20T15:00:00Z');
const LOW_DEADLINE = { eventDate: 'high', cfpDeadline: 'low', location: 'high' } as const;

function call(overrides: Partial<CallFields> = {}): CallFields {
  return { cfpDeadline: null, deadlineTimezone: 'UTC', dateConfidence: null, eventDate: null, hasOpenCall: true, ...overrides };
}

describe('callState', () => {
  it('counts the days left on the deadline\'s own calendar', () => {
    expect(callState(call({ cfpDeadline: '2026-11-25T23:59:59Z' }), NOW)).toEqual({
      kind: 'closing',
      daysLeft: 5,
      approximate: false,
      urgent: true,
    });
  });

  it('is day 0 on the day it closes, however few hours are left', () => {
    expect(callState(call({ cfpDeadline: '2026-11-20T23:59:59Z' }), NOW)).toMatchObject({ kind: 'closing', daysLeft: 0, urgent: true });
  });

  it('is urgent within a week and not after', () => {
    expect(callState(call({ cfpDeadline: '2026-11-27T23:59:59Z' }), NOW)).toMatchObject({ daysLeft: 7, urgent: true });
    expect(callState(call({ cfpDeadline: '2026-11-28T23:59:59Z' }), NOW)).toMatchObject({ daysLeft: 8, urgent: false });
  });

  it('never calls an approximate deadline urgent: the date was inferred, not read', () => {
    const state = callState(call({ cfpDeadline: '2026-11-22T23:59:59Z', dateConfidence: LOW_DEADLINE }), NOW);
    expect(state).toEqual({ kind: 'closing', daysLeft: 2, approximate: true, urgent: false });
  });

  it('is open with no deadline, until the event when there is one', () => {
    expect(callState(call({ eventDate: '2027-02-22T00:00:00Z' }), NOW)).toEqual({ kind: 'open', until: '2027-02-22T00:00:00Z' });
    expect(callState(call(), NOW)).toEqual({ kind: 'open', until: null });
  });

  it('treats a row nobody judged as an open call', () => {
    expect(callState(call({ hasOpenCall: null }), NOW).kind).toBe('open');
    expect(callState(call({ hasOpenCall: undefined, cfpDeadline: '2026-12-25T23:59:59Z' }), NOW).kind).toBe('closing');
  });

  it('is an event to watch when its page has no call, whatever deadline was stored', () => {
    expect(callState(call({ hasOpenCall: false, cfpDeadline: '2026-11-25T23:59:59Z' }), NOW)).toEqual({ kind: 'watch' });
  });

  it('is closed once the deadline has passed', () => {
    expect(callState(call({ cfpDeadline: '2026-11-19T23:59:59Z' }), NOW)).toEqual({ kind: 'closed' });
  });
});

describe('countdownText', () => {
  const text = (overrides: Partial<CallFields>) => countdownText(callState(call(overrides), NOW));

  it('reads as a figure over its unit', () => {
    expect(text({ cfpDeadline: '2026-11-25T23:59:59Z' })).toEqual({ figure: '5', unit: 'days left' });
    expect(text({ cfpDeadline: '2026-11-21T23:59:59Z' })).toEqual({ figure: '1', unit: 'day left' });
  });

  it('says today on the last day', () => {
    expect(text({ cfpDeadline: '2026-11-20T23:59:59Z' })).toEqual({ figure: 'Today', unit: 'last day' });
  });

  it('marks an approximate count', () => {
    expect(text({ cfpDeadline: '2026-12-02T23:59:59Z', dateConfidence: LOW_DEADLINE })).toEqual({ figure: '~12', unit: 'days left' });
  });

  it('says how long an open call stays open', () => {
    expect(text({ eventDate: '2027-02-22T00:00:00Z' })).toEqual({ figure: 'Open', unit: 'until Feb 22' });
    expect(text({})).toEqual({ figure: 'Open', unit: 'all year' });
  });

  it('says there is no call, and that a call closed', () => {
    expect(text({ hasOpenCall: false })).toEqual({ figure: 'No call', unit: 'yet' });
    expect(text({ cfpDeadline: '2026-11-01T23:59:59Z' })).toEqual({ figure: 'Closed', unit: '' });
  });
});
