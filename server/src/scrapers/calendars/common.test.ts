import { describe, it, expect, beforeEach, vi } from 'vitest';

const opportunity = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('../../lib/prisma.js', () => ({ prisma: { opportunity } }));

import { persistCalendarResults, toScraperResult, utcDay } from './common.js';
import { isUnreadSearchHit } from '../../services/searchSources.js';
import type { ScraperResult } from '../qualityScore.js';

const calendar = { source: 'thetradeshowcalendar.com', name: 'The Trade Show Calendar', listingUrl: 'https://www.thetradeshowcalendar.com/tsnn/' };

function listed(slug: string, overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    ...toScraperResult({ name: `Show ${slug}`, url: `https://show-${slug}.example.org/`, startDate: new Date('2027-03-01T00:00:00Z') }, calendar),
    ...overrides,
  };
}

describe('persistCalendarResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opportunity.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  });

  it('adds what is new and leaves a stored address untouched, whoever listed it', async () => {
    opportunity.findMany.mockResolvedValue([{ applyUrl: 'https://show-a.example.org/' }]);
    const summary = await persistCalendarResults([listed('a'), listed('b')]);

    expect(summary).toEqual({ added: 1, updated: 0, deferred: 0 });
    const { data, skipDuplicates } = opportunity.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data.map((row: { applyUrl: string }) => row.applyUrl)).toEqual(['https://show-b.example.org/']);
    expect(opportunity.update).not.toHaveBeenCalled();
    expect(opportunity.upsert).not.toHaveBeenCalled();
  });

  it('stores a new row as a link to read, not a listed call', async () => {
    opportunity.findMany.mockResolvedValue([]);
    await persistCalendarResults([listed('c')]);
    const [row] = opportunity.createMany.mock.calls[0][0].data;
    expect(row).toMatchObject({ source: 'thetradeshowcalendar.com', applyUrl: 'https://show-c.example.org/' });
    expect(isUnreadSearchHit(row)).toBe(true);
  });

  it('drops junk before it asks the database anything', async () => {
    const summary = await persistCalendarResults([listed('d', { applyUrl: 'https://show-d.example.org/brochure.pdf' })]);
    expect(summary).toEqual({ added: 0, updated: 0, deferred: 0 });
    expect(opportunity.findMany).not.toHaveBeenCalled();
  });

  it('writes nothing once the time budget is spent, and counts what waits', async () => {
    opportunity.findMany.mockResolvedValue([]);
    const summary = await persistCalendarResults([listed('e'), listed('f')], { deadline: Date.now() - 1 });
    expect(summary).toEqual({ added: 0, updated: 0, deferred: 2 });
    expect(opportunity.createMany).not.toHaveBeenCalled();
  });
});

describe('utcDay', () => {
  it('reads the date at the start of a timestamp as that UTC day', () => {
    expect(utcDay('2027-04-13 09:00:00')).toEqual(new Date('2027-04-13T00:00:00Z'));
    expect(utcDay('soon')).toBeUndefined();
    expect(utcDay(undefined)).toBeUndefined();
  });
});
