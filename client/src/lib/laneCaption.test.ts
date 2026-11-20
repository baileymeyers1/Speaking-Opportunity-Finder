import { describe, expect, it } from 'vitest';
import type { LaneSummary } from '../types';
import { laneCaption } from './laneCaption';

function lanes(overrides: Partial<LaneSummary> = {}): LaneSummary {
  return { counts: { closing: 560, open: 127, watch: 91 }, closingWithin7: 67, closingWithin30: 246, ...overrides };
}

describe('laneCaption', () => {
  it('says how many calls close within a week', () => {
    expect(laneCaption('closing', lanes())).toBe('67 close within a week');
  });

  it('agrees with one call', () => {
    expect(laneCaption('closing', lanes({ closingWithin7: 1 }))).toBe('1 closes within a week');
  });

  it('widens to a month when nothing closes this week', () => {
    expect(laneCaption('closing', lanes({ closingWithin7: 0, closingWithin30: 12 }))).toBe('12 close within a month');
    expect(laneCaption('closing', lanes({ closingWithin7: 0, closingWithin30: 1 }))).toBe('1 closes within a month');
  });

  it('says so when deadlines exist but none is near', () => {
    expect(laneCaption('closing', lanes({ closingWithin7: 0, closingWithin30: 0 }))).toBe('None close within a month');
  });

  it('groups thousands', () => {
    expect(laneCaption('closing', lanes({ closingWithin7: 1284 }))).toBe('1,284 close within a week');
  });

  it('says what the other two lanes hold', () => {
    expect(laneCaption('open', lanes())).toBe('No stated deadline: open until the event, or all year');
    expect(laneCaption('watch', lanes())).toBe('Events with no call for speakers yet');
  });

  it('is empty for an empty lane: the list says why', () => {
    const empty = lanes({ counts: { closing: 0, open: 0, watch: 0 }, closingWithin7: 0, closingWithin30: 0 });
    expect(laneCaption('closing', empty)).toBe('');
    expect(laneCaption('open', empty)).toBe('');
    expect(laneCaption('watch', empty)).toBe('');
  });

  it('is empty until the numbers arrive', () => {
    expect(laneCaption('closing', undefined)).toBe('');
  });
});
