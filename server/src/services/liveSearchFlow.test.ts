import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as Extraction from './extraction.js';

/**
 * performLiveSearch end to end with Linkup, page fetches, Claude and the
 * database mocked: which hits are read in the request, which are handed back
 * as stored rows, and which wait for the enrichment worker.
 */
const mocks = vi.hoisted(() => ({
  storedUrls: new Set<string>(),
  pendingUrls: new Set<string>(),
  findMany: vi.fn(),
  createMany: vi.fn(),
  extract: vi.fn(),
}));

vi.mock('../config/index.js', () => ({
  config: { scrapers: { webSearch: 'test-linkup-key' }, claude: { apiKey: 'test-claude-key' } },
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: { opportunity: { findMany: mocks.findMany, createMany: mocks.createMany } },
}));

vi.mock('./pageText.js', () => ({
  fetchPageText: vi.fn(async () => ({ ok: true, text: 'Call for speakers on AI in PR. Submit by the deadline.' })),
}));

vi.mock('./eventAssignment.js', () => ({ assignEvents: vi.fn(async () => undefined) }));

vi.mock('./extraction.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Extraction>();
  return { ...actual, extractOpportunitiesBatch: mocks.extract };
});

import { performLiveSearch, SYNC_ENRICH_LIMIT } from './liveSearchService.js';

interface LinkupItem {
  name: string;
  url: string;
  content: string;
}

function hit(slug: string, name = `AI for PR Summit ${slug}`): LinkupItem {
  return {
    name,
    url: `https://events.example/${slug}`,
    content: `${name}: we are looking for speakers on AI and PR. Join communications leaders for talks and panels.`,
  };
}

function extractionOk() {
  return {
    status: 'ok' as const,
    result: {
      eventDate: null,
      cfpDeadline: null,
      deadlineTimezone: null,
      location: 'New York, NY',
      isRemote: false,
      isClosed: false,
      isRelevant: true,
      compensationType: null,
      compensationAmount: null,
      format: 'conference',
      industries: ['ai', 'marketing'],
      cleanTitle: null,
      cleanOrganization: null,
      confidence: { eventDate: 'high', cfpDeadline: 'high', location: 'high' },
    },
  };
}

function linkupReturns(items: LinkupItem[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ results: items }), { status: 200 }))
  );
}

beforeEach(() => {
  mocks.storedUrls = new Set();
  mocks.pendingUrls = new Set();
  mocks.findMany.mockImplementation(async (args: { where: { applyUrl?: { in: string[] } } }) => {
    const urls = args.where.applyUrl?.in ?? [];
    return urls
      .filter((u) => mocks.storedUrls.has(u))
      .map((applyUrl) => ({
        applyUrl,
        id: applyUrl,
        source: 'Live Search',
        enrichmentStatus: mocks.pendingUrls.has(applyUrl) ? null : 'enriched',
      }));
  });
  mocks.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  mocks.extract.mockImplementation(async (inputs: unknown[]) => inputs.map(() => extractionOk()));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.findMany.mockReset();
  mocks.createMany.mockReset();
  mocks.extract.mockReset();
});

describe('performLiveSearch', () => {
  it('hands back stored hits by URL and reads only the new ones', async () => {
    linkupReturns([hit('known'), hit('new-a'), hit('new-b')]);
    mocks.storedUrls.add('https://events.example/known');

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.storedUrls).toEqual(['https://events.example/known']);
    expect(outcome.results.map((r) => r.applyUrl).sort()).toEqual([
      'https://events.example/new-a',
      'https://events.example/new-b',
    ]);
    const readUrls = mocks.extract.mock.calls.flatMap(([inputs]) => (inputs as Array<{ applyUrl: string }>).map((i) => i.applyUrl));
    expect(readUrls).not.toContain('https://events.example/known');
    expect(outcome.pendingCount).toBe(0);
  });

  it('makes no Claude call when every hit is already stored', async () => {
    linkupReturns([hit('known-a'), hit('known-b')]);
    mocks.storedUrls.add('https://events.example/known-a');
    mocks.storedUrls.add('https://events.example/known-b');

    const outcome = await performLiveSearch('AI for PR', []);

    expect(mocks.extract).not.toHaveBeenCalled();
    expect(outcome.results).toEqual([]);
    expect(outcome.storedUrls).toHaveLength(2);
  });

  it('counts hits an earlier search stored but nobody has read yet as pending', async () => {
    linkupReturns([hit('known-read'), hit('known-unread')]);
    mocks.storedUrls.add('https://events.example/known-read');
    mocks.storedUrls.add('https://events.example/known-unread');
    mocks.pendingUrls.add('https://events.example/known-unread');

    const outcome = await performLiveSearch('AI for PR', []);

    expect(mocks.extract).not.toHaveBeenCalled();
    expect(outcome.pendingCount).toBe(1);
  });

  it('returns only the hits read in the request and counts the rest as pending', async () => {
    linkupReturns(Array.from({ length: SYNC_ENRICH_LIMIT + 3 }, (_, i) => hit(`new-${i}`)));

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.results).toHaveLength(SYNC_ENRICH_LIMIT);
    expect(outcome.results.every((r) => r.location === 'New York, NY')).toBe(true);
    expect(outcome.pendingCount).toBe(3);
    // Every new hit is stored, read or not.
    const stored = mocks.createMany.mock.calls.flatMap(([args]) => (args as { data: unknown[] }).data);
    expect(stored).toHaveLength(SYNC_ENRICH_LIMIT + 3);
  });

  it('drops hits that do not contain every query word as a word', async () => {
    linkupReturns([
      hit('match'),
      { name: 'Retail Product Days', url: 'https://events.example/retail', content: 'He said the April product launch needs speakers.' },
      { name: 'Conf42 MLOps', url: 'https://events.example/mlops', content: 'A virtual AI conference looking for speakers.' },
    ]);

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.results.map((r) => r.applyUrl)).toEqual(['https://events.example/match']);
  });

  it('hides a read hit that turned out not to be an opportunity, without counting it as pending', async () => {
    linkupReturns([hit('listicle')]);
    mocks.extract.mockImplementation(async (inputs: unknown[]) =>
      inputs.map(() => ({ ...extractionOk(), result: { ...extractionOk().result, isRelevant: false } }))
    );

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.results).toEqual([]);
    expect(outcome.pendingCount).toBe(0);
  });
});
