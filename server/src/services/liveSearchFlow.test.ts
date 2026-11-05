import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as Extraction from './extraction.js';

/**
 * performLiveSearch end to end with Linkup, page fetches, Claude and the
 * database mocked: which hits are read in the request, which are handed back
 * as stored rows, which wait for the enrichment worker, and what the summary
 * says about them.
 */
interface StoredRow {
  id: string;
  title: string;
  applyUrl: string;
  source: string;
  enrichmentStatus: string | null;
  isClosed: boolean;
  isRelevant: boolean;
}

const mocks = vi.hoisted(() => ({
  table: new Map<string, StoredRow>(),
  extract: vi.fn(),
  enrichRowsNow: vi.fn(),
}));

vi.mock('../config/index.js', () => ({
  config: { scrapers: { webSearch: 'test-linkup-key' }, claude: { apiKey: 'test-claude-key' } },
}));

/** An in-memory Opportunity table: enough of findMany/createMany for the live search. */
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    opportunity: {
      findMany: vi.fn(async (args: { where: { applyUrl?: { in: string[] } } }) => {
        const urls = args.where.applyUrl?.in ?? [];
        return urls.flatMap((url) => {
          const row = mocks.table.get(url);
          return row ? [{ ...row }] : [];
        });
      }),
      createMany: vi.fn(async ({ data }: { data: Array<Omit<StoredRow, 'id'>> }) => {
        for (const row of data) {
          mocks.table.set(row.applyUrl, {
            id: `id-${row.applyUrl}`,
            title: row.title,
            applyUrl: row.applyUrl,
            source: row.source,
            enrichmentStatus: row.enrichmentStatus ?? null,
            isClosed: row.isClosed,
            isRelevant: row.isRelevant,
          });
        }
        return { count: data.length };
      }),
    },
  },
}));

vi.mock('./pageText.js', () => ({
  fetchPageText: vi.fn(async () => ({ ok: true, text: 'Call for speakers on AI in PR. Submit by the deadline.' })),
}));

vi.mock('./eventAssignment.js', () => ({ assignEvents: vi.fn(async () => undefined) }));

vi.mock('./backgroundEnrichment.js', () => ({ enrichRowsNow: mocks.enrichRowsNow }));

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

const urlOf = (slug: string) => `https://events.example/${slug}`;

function hit(slug: string, name = `AI for PR Summit ${slug}`): LinkupItem {
  return {
    name,
    url: urlOf(slug),
    content: `${name}: we are looking for speakers on AI and PR. Join communications leaders for talks and panels.`,
  };
}

/** A row an earlier search stored. */
function storedBefore(slug: string, state: Partial<StoredRow> = {}) {
  mocks.table.set(urlOf(slug), {
    id: `id-${slug}`,
    title: `AI for PR Summit ${slug}`,
    applyUrl: urlOf(slug),
    source: 'Live Search',
    enrichmentStatus: 'enriched',
    isClosed: false,
    isRelevant: true,
    ...state,
  });
}

function extractionOk(overrides: { isRelevant?: boolean } = {}) {
  return {
    status: 'ok' as const,
    result: {
      eventDate: null,
      cfpDeadline: null,
      deadlineTimezone: null,
      location: 'New York, NY',
      isRemote: false,
      isClosed: false,
      isRelevant: overrides.isRelevant ?? true,
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

const extractedUrls = () =>
  mocks.extract.mock.calls.flatMap(([inputs]) => (inputs as Array<{ applyUrl: string }>).map((i) => i.applyUrl));

beforeEach(() => {
  mocks.table.clear();
  mocks.extract.mockImplementation(async (inputs: unknown[]) => inputs.map(() => extractionOk()));
  // The worker's per-row read: mark each claimed row enriched and open.
  mocks.enrichRowsNow.mockImplementation(async (ids: string[]) => {
    for (const row of mocks.table.values()) {
      if (ids.includes(row.id)) row.enrichmentStatus = 'enriched';
    }
    return ids.length;
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.extract.mockReset();
  mocks.enrichRowsNow.mockReset();
});

describe('performLiveSearch', () => {
  it('hands back stored hits by URL and reads only the new ones', async () => {
    linkupReturns([hit('known'), hit('new-a'), hit('new-b')]);
    storedBefore('known');

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.storedUrls).toEqual([urlOf('known')]);
    expect(outcome.results.map((r) => r.applyUrl).sort()).toEqual([urlOf('new-a'), urlOf('new-b')]);
    expect(extractedUrls()).not.toContain(urlOf('known'));
    expect(outcome.waiting).toEqual([]);
  });

  it('makes no Claude call when every hit is already stored and read', async () => {
    linkupReturns([hit('known-a'), hit('known-b')]);
    storedBefore('known-a');
    storedBefore('known-b');

    const outcome = await performLiveSearch('AI for PR', []);

    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.enrichRowsNow).not.toHaveBeenCalled();
    expect(outcome.results).toEqual([]);
    expect(outcome.storedUrls).toHaveLength(2);
  });

  it('spends the calls new hits leave over on hits an earlier search left unread', async () => {
    linkupReturns([hit('new'), hit('known-read'), hit('waiting-a'), hit('waiting-b')]);
    storedBefore('known-read');
    storedBefore('waiting-a', { enrichmentStatus: null });
    storedBefore('waiting-b', { enrichmentStatus: null });

    const outcome = await performLiveSearch('AI for PR', []);

    expect(mocks.enrichRowsNow).toHaveBeenCalledWith(['id-waiting-a', 'id-waiting-b']);
    expect(outcome.waiting).toEqual([]);
    // Read now, they are listed as stored rows by the caller.
    expect(outcome.storedUrls).toEqual(expect.arrayContaining([urlOf('waiting-a'), urlOf('waiting-b')]));
  });

  it('never reads more than the in-request limit in total', async () => {
    linkupReturns([...Array.from({ length: SYNC_ENRICH_LIMIT - 1 }, (_, i) => hit(`new-${i}`)), hit('waiting-a'), hit('waiting-b')]);
    storedBefore('waiting-a', { enrichmentStatus: null });
    storedBefore('waiting-b', { enrichmentStatus: null });

    const outcome = await performLiveSearch('AI for PR', []);

    expect(extractedUrls()).toHaveLength(SYNC_ENRICH_LIMIT - 1);
    expect(mocks.enrichRowsNow).toHaveBeenCalledWith(['id-waiting-a']);
    expect(outcome.waiting).toEqual([{ title: 'AI for PR Summit waiting-b', applyUrl: urlOf('waiting-b') }]);
  });

  it('lists new hits it could not read by title, still unchecked', async () => {
    linkupReturns(Array.from({ length: SYNC_ENRICH_LIMIT + 2 }, (_, i) => hit(`new-${i}`)));

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.results).toHaveLength(SYNC_ENRICH_LIMIT);
    expect(outcome.results.every((r) => r.location === 'New York, NY')).toBe(true);
    expect(outcome.waiting).toHaveLength(2);
    expect(outcome.waiting.every((w) => w.title.startsWith('AI for PR Summit'))).toBe(true);
    expect(outcome.foundCount).toBe(SYNC_ENRICH_LIMIT + 2);
  });

  it('counts hits read now or earlier that are not open calls', async () => {
    linkupReturns([hit('listicle'), hit('closed-before'), hit('vendor-before'), hit('open-before')]);
    storedBefore('closed-before', { isClosed: true });
    storedBefore('vendor-before', { isRelevant: false });
    storedBefore('open-before');
    mocks.extract.mockImplementation(async (inputs: unknown[]) => inputs.map(() => extractionOk({ isRelevant: false })));

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.results).toEqual([]);
    expect(outcome.foundCount).toBe(4);
    expect(outcome.notOpenCount).toBe(3);
    expect(outcome.waiting).toEqual([]);
  });

  it('drops hits that do not contain every query word as a word', async () => {
    linkupReturns([
      hit('match'),
      { name: 'Retail Product Days', url: urlOf('retail'), content: 'He said the April product launch needs speakers.' },
      { name: 'Conf42 MLOps', url: urlOf('mlops'), content: 'A virtual AI conference looking for speakers.' },
    ]);

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.results.map((r) => r.applyUrl)).toEqual([urlOf('match')]);
    expect(outcome.foundCount).toBe(1);
  });
});
