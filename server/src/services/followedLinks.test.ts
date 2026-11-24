import { describe, it, expect, vi } from 'vitest';
import { linksToFollow, queueFollowedLinks, type FollowedLinksDb } from './followedLinks.js';
import type { ExtractionResult } from './extraction.js';

function extraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    eventDate: null,
    cfpDeadline: null,
    deadlineTimezone: null,
    location: null,
    isRemote: false,
    isClosed: false,
    isRelevant: false,
    hasOpenCall: false,
    compensationType: null,
    compensationAmount: null,
    format: 'other',
    industries: [],
    sectors: [],
    cleanTitle: 'Energy Conferences in the US',
    cleanOrganization: null,
    confidence: { eventDate: 'low', cfpDeadline: 'low', location: 'low' },
    payToPresent: null,
    callPageUrl: null,
    officialUrl: null,
    listedEvents: [],
    ...overrides,
  };
}

const DIRECTORY = { applyUrl: 'https://www.sovereigntyfounders.com/discover/energy', source: 'Live Search', title: 'Energy Conferences & Events in the US' };
const LISTED = [
  { name: 'APPA Joint Action Conference 2027', url: 'https://www.publicpower.org/event/2027-joint-action' },
  { name: 'ERCOT Power NEXT 2027', url: 'https://emitree.com/conferences/ercot-power-next' },
];

function fakeDb(stored: string[] = []) {
  const created: Array<Record<string, unknown>> = [];
  const db: FollowedLinksDb = {
    opportunity: {
      findMany: vi.fn(async ({ where }: { where: { applyUrl: { in: string[] } } }) =>
        where.applyUrl.in.filter((url: string) => stored.includes(url)).map((applyUrl: string) => ({ applyUrl }))
      ),
      createMany: vi.fn(async ({ data }) => {
        created.push(...data);
        return { count: data.length };
      }),
    },
  };
  return { db, created };
}

describe('linksToFollow', () => {
  it("takes a directory's listed events and a listing's official site", () => {
    expect(linksToFollow(DIRECTORY, extraction({ listedEvents: LISTED })).map((link) => link.url)).toEqual(LISTED.map((link) => link.url));
    const detail = { applyUrl: 'https://renewablescalendar.com/events/rng-conference-2026', source: 'Linkup Search', title: 'RNG Conference 2026' };
    expect(linksToFollow(detail, extraction({ cleanTitle: 'RNG Conference 2026', officialUrl: 'https://www.rngcoalition.com/rng-conference' }))).toEqual([
      { name: 'RNG Conference 2026', url: 'https://www.rngcoalition.com/rng-conference' },
    ]);
  });

  it('never fans out a directory found by following a link, though it may still name its own site', () => {
    const followed = { ...DIRECTORY, source: 'Followed Link' };
    const links = linksToFollow(followed, extraction({ listedEvents: LISTED, officialUrl: 'https://energy-events.example/' }));
    expect(links.map((link) => link.url)).toEqual(['https://energy-events.example/']);
  });

  it('leaves out the page itself, repeats, social pages and pay-to-present aggregators', () => {
    const links = linksToFollow(
      DIRECTORY,
      extraction({
        listedEvents: [
          { name: 'Itself', url: DIRECTORY.applyUrl },
          LISTED[0],
          { name: 'Again', url: LISTED[0].url },
          { name: 'Our LinkedIn', url: 'https://www.linkedin.com/company/x' },
          { name: 'Energy Conference in California 2026', url: 'https://conferenceinusa.com/cities/california/energy' },
        ],
      })
    );
    expect(links).toEqual([LISTED[0]]);
  });
});

describe('queueFollowedLinks', () => {
  it('stores each new link as an unread followed row that remembers the page it came from', async () => {
    const { db, created } = fakeDb([LISTED[1].url]);
    const count = await queueFollowedLinks(DIRECTORY, extraction({ listedEvents: LISTED }), db);
    expect(count).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: LISTED[0].name,
      organization: 'publicpower.org',
      applyUrl: LISTED[0].url,
      source: 'Followed Link',
      sourceUrl: DIRECTORY.applyUrl,
      format: 'other',
    });
    expect(created[0]).not.toHaveProperty('enrichmentStatus');
  });

  it('writes nothing when there is nothing new to follow', async () => {
    const { db } = fakeDb(LISTED.map((link) => link.url));
    expect(await queueFollowedLinks(DIRECTORY, extraction({ listedEvents: LISTED }), db)).toBe(0);
    expect(db.opportunity.createMany).not.toHaveBeenCalled();
    expect(await queueFollowedLinks(DIRECTORY, extraction(), db)).toBe(0);
  });
});
