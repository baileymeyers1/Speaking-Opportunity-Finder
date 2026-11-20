import { describe, expect, it } from 'vitest';
import type { CallFields } from './callState';
import { callStanding, checkedAgo } from './callStanding';

const NOW = new Date('2026-11-20T15:00:00Z');
const NEW_YORK = 'America/New_York';
const LOW_DEADLINE = { eventDate: 'high', cfpDeadline: 'low', location: 'high' } as const;

function call(overrides: Partial<CallFields> = {}): CallFields {
  return { cfpDeadline: null, deadlineTimezone: null, dateConfidence: null, eventDate: null, hasOpenCall: true, ...overrides };
}

const standing = (overrides: Partial<CallFields>) => callStanding(call(overrides), NOW, NEW_YORK);

describe('callStanding', () => {
  it('says when a call closes, in its own zone and on the viewer\'s clock', () => {
    expect(standing({ cfpDeadline: '2026-11-30T22:59:59Z', deadlineTimezone: 'Europe/Berlin' })).toEqual({
      lead: 'Closes Monday, November 30, 2026, 11:59 PM GMT+1',
      detail: '5:59 PM your time',
      notes: [],
    });
  });

  it('names the viewer\'s day when it is a different one', () => {
    const lines = standing({ cfpDeadline: '2026-12-01T11:59:59Z', deadlineTimezone: 'AoE' });
    expect(lines.lead).toBe('Closes Monday, November 30, 2026, 11:59 PM AoE');
    expect(lines.detail).toBe('Dec 1, 6:59 AM your time');
  });

  it('says so when the page gave no time zone', () => {
    const lines = standing({ cfpDeadline: '2026-11-30T00:00:00Z', deadlineTimezone: null });
    expect(lines.lead).toBe('Closes Monday, November 30, 2026, 11:59 PM AoE');
    expect(lines.notes).toEqual(['Time zone not stated; read as Anywhere on Earth (UTC-12).']);
  });

  it('marks an approximate deadline and says why', () => {
    const lines = standing({ cfpDeadline: '2026-11-30T22:59:59Z', deadlineTimezone: 'Europe/Berlin', dateConfidence: LOW_DEADLINE });
    expect(lines.lead).toBe('Closes around Monday, November 30, 2026');
    expect(lines.detail).toBeNull();
    expect(lines.notes[0]).toMatch(/^Approximate: /);
  });

  it('says how long a call with no deadline stays open', () => {
    expect(standing({ eventDate: '2027-02-22T00:00:00Z' })).toEqual({
      lead: 'No deadline is stated',
      detail: 'Open until the event starts on Monday, February 22, 2027.',
      notes: [],
    });
    expect(standing({})).toEqual({ lead: 'No deadline is stated', detail: 'Open all year.', notes: [] });
  });

  it('explains an event with no call', () => {
    const lines = standing({ hasOpenCall: false, eventDate: '2027-02-22T00:00:00Z' });
    expect(lines.lead).toBe('No call for speakers yet');
    expect(lines.detail).toMatch(/found no call for speakers/);
  });

  it('says when a call closed', () => {
    expect(standing({ cfpDeadline: '2026-11-10T22:59:59Z', deadlineTimezone: 'Europe/Berlin' })).toEqual({
      lead: 'Closed Tuesday, November 10, 2026',
      detail: null,
      notes: [],
    });
  });
});

describe('checkedAgo', () => {
  it('counts whole days since the last completed check', () => {
    expect(checkedAgo({ verifiedAt: '2026-11-20T08:00:00Z' }, NOW)).toBe('Today');
    expect(checkedAgo({ verifiedAt: '2026-11-19T14:00:00Z' }, NOW)).toBe('Yesterday');
    expect(checkedAgo({ verifiedAt: '2026-11-17T10:00:00Z' }, NOW)).toBe('3 days ago');
  });

  it('is null when the listing was never checked or the last check failed', () => {
    expect(checkedAgo({ verifiedAt: null }, NOW)).toBeNull();
    expect(checkedAgo({}, NOW)).toBeNull();
    expect(checkedAgo({ verifiedAt: '2026-11-17T10:00:00Z', verificationError: 'HTTP 503' }, NOW)).toBeNull();
    expect(checkedAgo({ verifiedAt: 'nope' }, NOW)).toBeNull();
  });
});
