import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `createOpportunity` (the save-live path) with the database mocked: which
 * sectors a saved row is stored with. Not a database test on purpose: the row
 * it stores is unread and unclaimed, exactly what the enrichment worker's
 * claim query looks for, so a real row in the shared test database lets
 * enrichmentBudget.db.test.ts claim it while it exists.
 */
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  assignEvents: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({ prisma: { opportunity: { create: mocks.create } } }));
vi.mock('./eventAssignment.js', () => ({ assignEvents: mocks.assignEvents }));

import { createOpportunity, type OpportunityCreateInput } from './opportunityService.js';

function input(overrides: Partial<OpportunityCreateInput> = {}): OpportunityCreateInput {
  return {
    title: 'AI for PR Conference 2027',
    organization: 'Comms Org',
    format: 'conference',
    applyUrl: 'https://save-live.example/ai-for-pr',
    source: 'Live Search',
    ...overrides,
  };
}

/** The `data` handed to `prisma.opportunity.create` by the last call. */
function storedData(): { sectors: string[]; industries: string } {
  return mocks.create.mock.calls[mocks.create.mock.calls.length - 1][0].data;
}

describe('createOpportunity: sectors', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.assignEvents.mockReset();
    // The stored row is what was asked for, with the columns the database adds.
    mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'row-1',
      description: null,
      location: null,
      isRemote: false,
      eventDate: null,
      cfpDeadline: null,
      compensationType: null,
      compensationAmount: null,
      compensationDetails: null,
      qualityScore: null,
      sourceUrl: null,
      createdAt: new Date('2026-11-19T00:00:00Z'),
      updatedAt: new Date('2026-11-19T00:00:00Z'),
      ...data,
    }));
    mocks.assignEvents.mockResolvedValue([]);
  });

  it('places a saved live result by its tags when it brings no sectors', async () => {
    const saved = await createOpportunity(input({ industries: ['public relations', 'ai'] }));
    expect(storedData().sectors).toEqual(['pr-communications', 'ai']);
    expect(storedData().industries).toBe(JSON.stringify(['public relations', 'ai']));
    expect(saved.sectors).toEqual(['pr-communications', 'ai']);
  });

  it('keeps the valid sectors a result brings with it, over its tags', async () => {
    const saved = await createOpportunity(input({ industries: ['ai'], sectors: ['marketing', 'bogus'] }));
    expect(storedData().sectors).toEqual(['marketing']);
    expect(saved.sectors).toEqual(['marketing']);
  });

  it('falls back to the tags when every sector it brings is unknown', async () => {
    await createOpportunity(input({ industries: ['nursing'], sectors: ['bogus'] }));
    expect(storedData().sectors).toEqual(['healthcare']);
  });

  it('stores no sector for a result with no tags', async () => {
    const saved = await createOpportunity(input());
    expect(storedData().sectors).toEqual([]);
    expect(saved.sectors).toEqual([]);
  });
});
