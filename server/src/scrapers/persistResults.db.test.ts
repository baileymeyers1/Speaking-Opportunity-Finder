import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// Event matching has its own tests; here it only has to be handed the new rows.
vi.mock('../services/eventAssignment.js', () => ({
  assignEvents: vi.fn(async () => []),
}));

import { prisma } from '../lib/prisma.js';
import { assignEvents } from '../services/eventAssignment.js';
import { persistResults } from './persistResults.js';
import type { ScraperResult } from './qualityScore.js';

const URL_PREFIX = 'https://persist-results.test/';

function scraped(slug: string, overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    title: `Conference ${slug} - Call for Speakers`,
    organization: `Organizer ${slug}`,
    description: 'A call for speakers long enough to be kept by the junk filter.',
    isRemote: false,
    cfpDeadline: new Date('2099-01-15T23:59:59Z'),
    format: 'conference',
    industries: ['technology'],
    applyUrl: `${URL_PREFIX}${slug}`,
    source: 'persist-results-test',
    ...overrides,
  };
}

/** A clock that advances one tick per deadline check. */
function tickingClock() {
  let tick = 0;
  return () => tick++;
}

async function storeRow(slug: string, title: string) {
  await prisma.opportunity.create({
    data: {
      title,
      organization: `Stored organizer ${slug}`,
      applyUrl: `${URL_PREFIX}${slug}`,
      source: 'persist-results-test',
      format: 'conference',
      industries: '[]',
    },
  });
}

async function clear() {
  await prisma.opportunity.deleteMany({ where: { applyUrl: { startsWith: URL_PREFIX } } });
}

describe('persistResults', () => {
  beforeEach(async () => {
    await clear();
    vi.mocked(assignEvents).mockClear();
  });

  afterAll(async () => {
    await clear();
  });

  it('creates new rows, refreshes stored ones and hands the new rows to event matching', async () => {
    await storeRow('stored-a', 'Old title A');
    await storeRow('stored-b', 'Old title B');

    const summary = await persistResults([scraped('stored-a'), scraped('new-c'), scraped('stored-b')]);

    expect(summary).toEqual({ added: 1, updated: 2, deferred: 0 });
    const rows = await prisma.opportunity.findMany({
      where: { applyUrl: { startsWith: URL_PREFIX } },
      orderBy: { applyUrl: 'asc' },
      select: { applyUrl: true, title: true },
    });
    expect(rows).toEqual([
      { applyUrl: `${URL_PREFIX}new-c`, title: 'Conference new-c - Call for Speakers' },
      { applyUrl: `${URL_PREFIX}stored-a`, title: 'Conference stored-a - Call for Speakers' },
      { applyUrl: `${URL_PREFIX}stored-b`, title: 'Conference stored-b - Call for Speakers' },
    ]);
    const handedToMatching = vi.mocked(assignEvents).mock.calls[0][1];
    expect(handedToMatching.map((row) => row.applyUrl)).toEqual([`${URL_PREFIX}new-c`]);
  });

  it('writes nothing once the deadline has passed and reports every result as deferred', async () => {
    await storeRow('stored-a', 'Old title A');

    const summary = await persistResults([scraped('stored-a'), scraped('new-b')], { deadline: 0, now: () => 1 });

    expect(summary).toEqual({ added: 0, updated: 0, deferred: 2 });
    const stored = await prisma.opportunity.findUnique({ where: { applyUrl: `${URL_PREFIX}stored-a` } });
    expect(stored?.title).toBe('Old title A');
    expect(await prisma.opportunity.count({ where: { applyUrl: `${URL_PREFIX}new-b` } })).toBe(0);
  });

  it('writes new rows before refreshing stored ones when time runs short', async () => {
    await storeRow('stored-a', 'Old title A');
    await storeRow('stored-b', 'Old title B');

    // The first check passes (tick 0 < 1); every later one is past the deadline.
    const summary = await persistResults(
      [scraped('stored-a'), scraped('stored-b'), scraped('new-c')],
      { deadline: 1, now: tickingClock() }
    );

    expect(summary).toEqual({ added: 1, updated: 0, deferred: 2 });
    expect(await prisma.opportunity.count({ where: { applyUrl: `${URL_PREFIX}new-c` } })).toBe(1);
    const storedTitles = await prisma.opportunity.findMany({
      where: { applyUrl: { in: [`${URL_PREFIX}stored-a`, `${URL_PREFIX}stored-b`] } },
      select: { title: true },
      orderBy: { applyUrl: 'asc' },
    });
    expect(storedTitles.map((row) => row.title)).toEqual(['Old title A', 'Old title B']);
  });
});
