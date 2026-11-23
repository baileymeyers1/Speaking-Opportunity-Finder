import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { utcDateKey } from '../services/enrichmentBudget.js';
import { claimDemoLiveSearch, DEMO_SEARCH_KEY_PREFIX } from './searchBudget.js';

/** Against the test Postgres, on a far-future day no other test uses. */
const DAY = new Date('2099-03-04T12:00:00Z');
const OTHER_DAY = new Date('2099-03-05T12:00:00Z');

afterAll(async () => {
  await prisma.enrichmentUsage.deleteMany({
    where: { date: { in: [DAY, OTHER_DAY].map((day) => `${DEMO_SEARCH_KEY_PREFIX}${utcDateKey(day)}`) } },
  });
});

describe('claimDemoLiveSearch', () => {
  it('allows the daily number of searches, then refuses until the next day', async () => {
    const claims = [];
    for (let i = 0; i < 4; i++) claims.push(await claimDemoLiveSearch(DAY, 3));
    expect(claims.map((claim) => claim.allowed)).toEqual([true, true, true, false]);
    expect(claims.map((claim) => claim.left)).toEqual([2, 1, 0, 0]);
    expect(await claimDemoLiveSearch(OTHER_DAY, 3)).toEqual({ allowed: true, left: 2 });
  });

  it('counts parallel searches without letting them overrun the limit', async () => {
    const day = new Date('2099-03-05T18:00:00Z');
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimDemoLiveSearch(day, 3)));
    // The first test already spent one of this day's three.
    expect(claims.filter((claim) => claim.allowed)).toHaveLength(2);
  });

  it('runs no search when the limit is zero', async () => {
    expect(await claimDemoLiveSearch(DAY, 0)).toEqual({ allowed: false, left: 0 });
  });
});
