import { describe, expect, it } from 'vitest';
import { planSavedCallAssignment, savedKey } from './savedCallAssignment.js';

const firstSpeakers = new Map([
  ['user-a', 'speaker-a'],
  ['user-b', 'speaker-b'],
]);

describe('planSavedCallAssignment', () => {
  it("gives each unassigned call to its account's first speaker", () => {
    const plan = planSavedCallAssignment(
      [
        { id: 'save-1', userId: 'user-a', opportunityId: 'call-1' },
        { id: 'save-2', userId: 'user-a', opportunityId: 'call-2' },
        { id: 'save-3', userId: 'user-b', opportunityId: 'call-1' },
      ],
      firstSpeakers,
      new Set()
    );

    expect(plan.assign).toEqual([
      { id: 'save-1', speakerId: 'speaker-a' },
      { id: 'save-2', speakerId: 'speaker-a' },
      { id: 'save-3', speakerId: 'speaker-b' },
    ]);
    expect(plan.noSpeaker).toBe(0);
    expect(plan.alreadyTheirs).toBe(0);
  });

  it('leaves the calls of an account with nobody on its roster', () => {
    const plan = planSavedCallAssignment([{ id: 'save-1', userId: 'user-c', opportunityId: 'call-1' }], firstSpeakers, new Set());

    expect(plan.assign).toEqual([]);
    expect(plan.noSpeaker).toBe(1);
  });

  it('leaves a call the speaker already has saved, so no call is saved twice for one person', () => {
    const plan = planSavedCallAssignment(
      [
        { id: 'save-1', userId: 'user-a', opportunityId: 'call-1' },
        { id: 'save-2', userId: 'user-a', opportunityId: 'call-2' },
      ],
      firstSpeakers,
      new Set([savedKey('speaker-a', 'call-1')])
    );

    expect(plan.assign).toEqual([{ id: 'save-2', speakerId: 'speaker-a' }]);
    expect(plan.alreadyTheirs).toBe(1);
  });

  it('gives only one of two unassigned copies of the same call', () => {
    const plan = planSavedCallAssignment(
      [
        { id: 'save-1', userId: 'user-a', opportunityId: 'call-1' },
        { id: 'save-2', userId: 'user-a', opportunityId: 'call-1' },
      ],
      firstSpeakers,
      new Set()
    );

    expect(plan.assign).toEqual([{ id: 'save-1', speakerId: 'speaker-a' }]);
    expect(plan.alreadyTheirs).toBe(1);
  });

  it('plans nothing the second time', () => {
    expect(planSavedCallAssignment([], firstSpeakers, new Set([savedKey('speaker-a', 'call-1')])).assign).toEqual([]);
  });
});
