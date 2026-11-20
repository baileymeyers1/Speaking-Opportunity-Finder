import { describe, expect, it } from 'vitest';
import type { Opportunity, SavedCategory, SavedOpportunity } from '../types';
import { countByStage, eventCountdownText, isStage, savedInStage, stageCaption } from './savedStage';

// The suite runs in America/Los_Angeles: this is 7 AM on November 20 there.
const NOW = new Date('2026-11-20T15:00:00Z');

function call(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'call',
    title: 'A call',
    organization: 'An organizer',
    description: null,
    location: null,
    isRemote: false,
    eventDate: null,
    cfpDeadline: null,
    deadlineTimezone: 'UTC',
    format: 'conference',
    industries: [],
    compensationType: null,
    compensationAmount: null,
    compensationDetails: null,
    applyUrl: 'https://example.org/call',
    source: 'test',
    sourceUrl: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    hasOpenCall: true,
    ...overrides,
  };
}

function saved(id: string, category: SavedCategory, overrides: Partial<Opportunity> | null = {}): SavedOpportunity {
  return {
    id,
    userId: 'user',
    opportunityId: `call-${id}`,
    category,
    createdAt: '2026-11-10T00:00:00Z',
    opportunity: overrides === null ? null : call({ id: `call-${id}`, title: id, ...overrides }),
  };
}

const ids = (items: SavedOpportunity[]) => items.map((item) => item.id);

describe('countByStage', () => {
  it('counts each stage, leaving out a saved call whose call no longer exists', () => {
    const items = [saved('a', 'interested'), saved('b', 'interested'), saved('c', 'applied'), saved('gone', 'accepted', null)];
    expect(countByStage(items)).toEqual({ interested: 2, applied: 1, accepted: 0, rejected: 0 });
  });
});

describe('savedInStage', () => {
  it('lists what you are interested in by what closes first, then open calls, then events with no call, then closed ones', () => {
    const items = [
      saved('closed', 'interested', { cfpDeadline: '2026-11-10T23:59:59Z' }),
      saved('no-call', 'interested', { hasOpenCall: false, eventDate: '2026-12-01T00:00:00Z' }),
      saved('rolling', 'interested', {}),
      saved('later', 'interested', { cfpDeadline: '2026-12-20T23:59:59Z' }),
      saved('open-until-event', 'interested', { eventDate: '2027-01-15T00:00:00Z' }),
      saved('soon', 'interested', { cfpDeadline: '2026-11-22T23:59:59Z' }),
      saved('elsewhere', 'applied', { cfpDeadline: '2026-11-21T23:59:59Z' }),
    ];
    expect(ids(savedInStage(items, 'interested', NOW))).toEqual([
      'soon',
      'later',
      'open-until-event',
      'rolling',
      'no-call',
      'closed',
    ]);
  });

  it('lists the other stages by the event: the next one first, undated ones after, past ones last', () => {
    const items = [
      saved('past', 'accepted', { eventDate: '2026-10-01T00:00:00Z' }),
      saved('undated', 'accepted', {}),
      saved('spring', 'accepted', { eventDate: '2027-04-14T00:00:00Z' }),
      saved('next-month', 'accepted', { eventDate: '2026-12-11T00:00:00Z' }),
    ];
    expect(ids(savedInStage(items, 'accepted', NOW))).toEqual(['next-month', 'spring', 'undated', 'past']);
  });

  it('leaves out a saved call whose call no longer exists', () => {
    expect(savedInStage([saved('gone', 'interested', null)], 'interested', NOW)).toEqual([]);
  });
});

describe('eventCountdownText', () => {
  it('counts calendar days to the event', () => {
    expect(eventCountdownText('2027-02-22T00:00:00Z', NOW)).toEqual({ figure: '94', unit: 'days to event' });
    expect(eventCountdownText('2026-11-21T00:00:00Z', NOW)).toEqual({ figure: '1', unit: 'day to event' });
  });

  it('says so on the day, after it, and when no date is known', () => {
    expect(eventCountdownText('2026-11-20T00:00:00Z', NOW)).toEqual({ figure: 'Today', unit: 'event day' });
    expect(eventCountdownText('2026-11-01T00:00:00Z', NOW)).toEqual({ figure: 'Past', unit: 'event held' });
    expect(eventCountdownText(null, NOW)).toEqual({ figure: 'No date', unit: 'yet' });
    expect(eventCountdownText('nope', NOW)).toEqual({ figure: 'No date', unit: 'yet' });
  });
});

describe('stageCaption', () => {
  it('says how many calls you are interested in close within a week', () => {
    const items = [
      saved('a', 'interested', { cfpDeadline: '2026-11-22T23:59:59Z' }),
      saved('b', 'interested', { cfpDeadline: '2026-11-27T23:59:59Z' }),
      saved('c', 'interested', { cfpDeadline: '2026-12-20T23:59:59Z' }),
    ];
    expect(stageCaption('interested', items, NOW)).toBe('2 close within a week');
    expect(stageCaption('interested', items.slice(1, 2), NOW)).toBe('1 closes within a week');
    expect(stageCaption('interested', items.slice(2), NOW)).toBe('None close within a week');
  });

  it('is empty when nothing there has a deadline, and for the other stages', () => {
    expect(stageCaption('interested', [saved('rolling', 'interested', {})], NOW)).toBe('');
    expect(stageCaption('interested', [], NOW)).toBe('');
    expect(stageCaption('applied', [saved('a', 'applied', { cfpDeadline: '2026-11-22T23:59:59Z' })], NOW)).toBe('');
  });
});

describe('isStage', () => {
  it('accepts the four stages and nothing else', () => {
    expect(['interested', 'applied', 'accepted', 'rejected'].every(isStage)).toBe(true);
    expect([null, '', 'all', 'Interested'].some(isStage)).toBe(false);
  });
});
