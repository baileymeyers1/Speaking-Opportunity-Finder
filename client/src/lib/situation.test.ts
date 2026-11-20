import { describe, expect, it } from 'vitest';
import type { LaneSummary } from '../types';
import { situationHeadline, situationNote } from './situation';

const NOW = new Date('2026-11-20T15:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

function lanes(overrides: Partial<LaneSummary> = {}): LaneSummary {
  return {
    counts: { closing: 560, open: 127, watch: 91 },
    closingWithin7: 67,
    closingWithin30: 246,
    nextToClose: { id: 'first', title: 'Rural Health Summit', cfpDeadline: inDays(2), deadlineTimezone: 'UTC' },
    ...overrides,
  };
}

const sentence = (summary: LaneSummary | undefined) => {
  const { lead, accent, tail } = situationHeadline(summary);
  return `${lead}[${accent}]${tail}`;
};

describe('situationHeadline', () => {
  it('leads with what closes within a week', () => {
    expect(sentence(lanes())).toBe('67 calls close [within a week].');
  });

  it('agrees with one call', () => {
    expect(sentence(lanes({ closingWithin7: 1 }))).toBe('1 call closes [within a week].');
  });

  it('widens to a month when nothing closes this week', () => {
    expect(sentence(lanes({ closingWithin7: 0, closingWithin30: 12 }))).toBe('12 calls close [within a month].');
  });

  it('says so when deadlines exist but none is near', () => {
    expect(sentence(lanes({ closingWithin7: 0, closingWithin30: 0 }))).toBe('Nothing closes [within a month].');
  });

  it('says so when what matches has no deadline at all', () => {
    const none = lanes({ counts: { closing: 0, open: 3, watch: 1 }, closingWithin7: 0, closingWithin30: 0, nextToClose: null });
    expect(sentence(none)).toBe('Nothing here has [a deadline].');
  });

  it('says so when nothing matches', () => {
    const empty = lanes({ counts: { closing: 0, open: 0, watch: 0 }, closingWithin7: 0, closingWithin30: 0, nextToClose: null });
    expect(sentence(empty)).toBe('No calls [match].');
  });

  it('groups thousands', () => {
    expect(sentence(lanes({ closingWithin7: 1284 }))).toBe('1,284 calls close [within a week].');
  });

  it('is the page\'s standing title until the numbers arrive', () => {
    expect(sentence(undefined)).toBe('What closes [soon]');
  });
});

describe('situationNote', () => {
  it('names the call that closes first and counts the rest of the month', () => {
    expect(situationNote(lanes(), NOW)).toEqual({
      next: { id: 'first', title: 'Rural Health Summit', when: 'in 2 days' },
      rest: 'Another 179 close within a month.',
    });
  });

  it('says today and tomorrow on the deadline\'s own calendar', () => {
    const today = lanes({ nextToClose: { id: 'a', title: 'A', cfpDeadline: '2026-11-20T23:59:59Z', deadlineTimezone: 'UTC' } });
    const tomorrow = lanes({ nextToClose: { id: 'a', title: 'A', cfpDeadline: '2026-11-21T23:59:59Z', deadlineTimezone: 'UTC' } });
    expect(situationNote(today, NOW)?.next?.when).toBe('today');
    expect(situationNote(tomorrow, NOW)?.next?.when).toBe('tomorrow');
  });

  it('agrees with one more call, and says nothing more when the week is the whole month', () => {
    expect(situationNote(lanes({ closingWithin7: 4, closingWithin30: 5 }), NOW)?.rest).toBe('Another 1 closes within a month.');
    expect(situationNote(lanes({ closingWithin7: 4, closingWithin30: 4 }), NOW)?.rest).toBe('');
  });

  it('counts what closes later when the headline is the month', () => {
    const month = lanes({ counts: { closing: 20, open: 0, watch: 0 }, closingWithin7: 0, closingWithin30: 12 });
    expect(situationNote(month, NOW)?.rest).toBe('8 more close later.');
  });

  it('points at the other lanes when nothing has a deadline', () => {
    const none = lanes({ counts: { closing: 0, open: 3, watch: 1 }, closingWithin7: 0, closingWithin30: 0, nextToClose: null });
    expect(situationNote(none, NOW)).toEqual({ next: null, rest: '3 calls are always open and 1 event has no call yet.' });
    const onlyOpen = lanes({ counts: { closing: 0, open: 1, watch: 0 }, closingWithin7: 0, closingWithin30: 0, nextToClose: null });
    expect(situationNote(onlyOpen, NOW)?.rest).toBe('1 call is always open.');
  });

  it('says what to do when nothing matches', () => {
    const empty = lanes({ counts: { closing: 0, open: 0, watch: 0 }, closingWithin7: 0, closingWithin30: 0, nextToClose: null });
    expect(situationNote(empty, NOW)?.rest).toBe('Clear a filter, or run a live search for something new.');
  });

  it('is nothing until the numbers arrive', () => {
    expect(situationNote(undefined, NOW)).toBeNull();
  });
});
