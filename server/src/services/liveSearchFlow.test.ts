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
  usageToday: 0,
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
    enrichmentUsage: {
      findUnique: vi.fn(async () => ({ count: mocks.usageToday })),
    },
  },
}));

vi.mock('./pageReader.js', () => ({
  readPage: vi.fn(async () => ({ ok: true, text: 'Call for speakers on AI in PR. Submit by the deadline.' })),
}));

vi.mock('./eventAssignment.js', () => ({ assignEvents: vi.fn(async () => undefined) }));

vi.mock('./backgroundEnrichment.js', () => ({ enrichRowsNow: mocks.enrichRowsNow }));

vi.mock('./extraction.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Extraction>();
  return { ...actual, extractOpportunity: mocks.extract };
});

import { buildSearchQueries, performLiveSearch, SYNC_ENRICH_LIMIT } from './liveSearchService.js';
import { assignEvents } from './eventAssignment.js';
import { readPage, type PageReadResult } from './pageReader.js';
import { DAILY_ENRICHMENT_LIMIT } from './enrichmentBudget.js';

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
      sectors: ['ai', 'marketing'],
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

const extractedUrls = () => mocks.extract.mock.calls.map(([input]) => (input as { applyUrl: string }).applyUrl);

beforeEach(() => {
  mocks.table.clear();
  mocks.usageToday = 0;
  mocks.extract.mockImplementation(async () => extractionOk());
  // The worker's per-row read: mark each claimed row enriched and open.
  mocks.enrichRowsNow.mockImplementation(async (ids: string[]) => {
    for (const row of mocks.table.values()) {
      if (ids.includes(row.id)) row.enrichmentStatus = 'enriched';
    }
    return { claimed: ids.length, read: ids.length };
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

  it('makes no Claude call for a hit whose page cannot be read, and leaves it unchecked', async () => {
    linkupReturns([hit('readable'), hit('blocked')]);
    const readable: PageReadResult = { ok: true, text: 'Call for speakers on AI in PR. Submit by the deadline.', status: 200 };
    vi.mocked(readPage).mockImplementation(async (url) =>
      url === urlOf('blocked') ? { ok: false, reason: 'http_error', status: 403, message: 'HTTP 403' } : readable
    );
    try {
      const outcome = await performLiveSearch('AI for PR', []);

      expect(extractedUrls()).toEqual([urlOf('readable')]);
      expect(outcome.results.map((r) => r.applyUrl)).toEqual([urlOf('readable')]);
      // Stored unread, so the worker tries the page again; a snippet is never shown as a result.
      expect(mocks.table.get(urlOf('blocked'))?.enrichmentStatus).toBeNull();
      expect(outcome.waiting).toEqual([{ title: 'AI for PR Summit blocked', applyUrl: urlOf('blocked') }]);
    } finally {
      vi.mocked(readPage).mockImplementation(async () => readable);
    }
  });

  it('extracts each hit as soon as its own page is read, without waiting for the slowest page', async () => {
    linkupReturns([hit('fast'), hit('slow')]);
    const readable: PageReadResult = { ok: true, text: 'Call for speakers on AI in PR. Submit by the deadline.', status: 200 };
    let releaseSlowPage: () => void = () => undefined;
    const slowPage = new Promise<PageReadResult>((resolve) => {
      releaseSlowPage = () => resolve(readable);
    });
    vi.mocked(readPage).mockImplementation(async (url) => (url === urlOf('slow') ? slowPage : readable));
    try {
      const search = performLiveSearch('AI for PR', []);
      // The fast hit is with Claude while the slow page is still loading.
      await vi.waitFor(() => expect(extractedUrls()).toEqual([urlOf('fast')]));
      releaseSlowPage();
      const outcome = await search;
      expect(extractedUrls()).toEqual([urlOf('fast'), urlOf('slow')]);
      expect(outcome.results.map((r) => r.applyUrl).sort()).toEqual([urlOf('fast'), urlOf('slow')]);
    } finally {
      vi.mocked(readPage).mockImplementation(async () => readable);
    }
  });

  it('matches only the hits it read to an event; the worker matches the rest when it reads them', async () => {
    vi.mocked(assignEvents).mockClear();
    linkupReturns(Array.from({ length: SYNC_ENRICH_LIMIT + 3 }, (_, i) => hit(`new-${i}`)));

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.waiting).toHaveLength(3);
    expect(assignEvents).toHaveBeenCalledTimes(1);
    const matched = vi.mocked(assignEvents).mock.calls[0][1].map((row) => row.applyUrl).sort();
    expect(matched).toEqual(outcome.results.map((r) => r.applyUrl).sort());
    expect(matched).toHaveLength(SYNC_ENRICH_LIMIT);
  });

  it('counts hits read now or earlier that are not open calls', async () => {
    linkupReturns([hit('listicle'), hit('closed-before'), hit('vendor-before'), hit('open-before')]);
    storedBefore('closed-before', { isClosed: true });
    storedBefore('vendor-before', { isRelevant: false });
    storedBefore('open-before');
    mocks.extract.mockImplementation(async () => extractionOk({ isRelevant: false }));

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

  it('drops a hit whose title names an event date that has passed', async () => {
    linkupReturns([
      hit('open'),
      {
        name: 'PR Daily Conference | June 3-5, 2025 | Brooklyn',
        url: urlOf('past'),
        content: 'Join PR and AI leaders for three days of sessions; we are looking for speakers.',
      },
    ]);

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.results.map((r) => r.applyUrl)).toEqual([urlOf('open')]);
    expect(outcome.foundCount).toBe(1);
  });

  it('says when background checks resume once the worker has spent the daily limit', async () => {
    linkupReturns(Array.from({ length: SYNC_ENRICH_LIMIT + 1 }, (_, i) => hit(`new-${i}`)));
    mocks.usageToday = DAILY_ENRICHMENT_LIMIT;

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.waiting).toHaveLength(1);
    const resumeAt = new Date(outcome.backgroundChecksResumeAt ?? '');
    expect(resumeAt.getUTCHours()).toBe(0);
    expect(resumeAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('says nothing about the background when it still has budget', async () => {
    linkupReturns(Array.from({ length: SYNC_ENRICH_LIMIT + 1 }, (_, i) => hit(`new-${i}`)));

    const outcome = await performLiveSearch('AI for PR', []);

    expect(outcome.backgroundChecksResumeAt).toBeNull();
  });
});

describe('buildSearchQueries', () => {
  const now = new Date('2026-11-05T12:00:00Z');

  it('names this year and next in every query', () => {
    const queries = buildSearchQueries('AI for PR', [], [], now);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => q.q.includes('2026 2027'))).toBe(true);
  });

  it('asks the ways calls are worded and other formats, with PR spelled out', () => {
    const text = buildSearchQueries('AI for PR', [], [], now).map((q) => q.q).join(' | ');
    expect(text).toContain('call for speakers');
    expect(text).toContain('call for presentations');
    expect(text).not.toContain('call for proposals');
    expect(text).toContain('podcast guest');
    expect(text).toContain('public relations');
  });

  it('spells out a place for the engine, whichever way it was typed', () => {
    for (const query of buildSearchQueries('Energy', [], ['CA'], now)) expect(query.q.endsWith(' California')).toBe(true);
    for (const query of buildSearchQueries('Energy', [], ['california', 'nyc'], now)) {
      expect(query.q.endsWith(' California OR New York')).toBe(true);
    }
  });

  it('searches for a sector on its own when there is no query text', () => {
    const queries = buildSearchQueries('', ['public relations'], [], now);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const query of queries) expect(query.q).toContain('2026 2027');
    expect(queries[queries.length - 1].q).toBe('public relations conference CFP 2026 2027');
  });

  it('adds an industry angle when industries are chosen', () => {
    const queries = buildSearchQueries('AI for PR', ['marketing'], [], now);
    expect(queries[0].q).toMatch(/^AI for PR .*speaking opportunity 2026 2027$/);
    expect(queries).toHaveLength(4);
  });
});

describe('performLiveSearch triage', () => {
  it('keeps a hit that spells out "public relations" instead of "PR"', async () => {
    linkupReturns([
      {
        name: 'Generative AI in Public Relations Summit 2027',
        url: urlOf('spelled-out'),
        content: 'Call for speakers: AI and public relations leaders, submit a session.',
      },
    ]);
    const outcome = await performLiveSearch('AI for PR', []);
    expect(outcome.results.map((r) => r.applyUrl)).toEqual([urlOf('spelled-out')]);
  });

  it('drops article titles and reads pages that look like calls first', async () => {
    linkupReturns([
      ...Array.from({ length: SYNC_ENRICH_LIMIT }, (_, i) => hit(`plain-${i}`, `AI for PR roundup ${i}`)),
      { name: 'How to Use AI in PR: Tools and Tips', url: urlOf('howto'), content: 'AI and PR tips for speakers.' },
      { name: 'AI in PR Summit', url: urlOf('call'), content: 'Call for speakers: AI and PR leaders, submit a session.' },
    ]);

    const outcome = await performLiveSearch('AI for PR', []);

    expect(extractedUrls()).toContain(urlOf('call'));
    expect(extractedUrls()).not.toContain(urlOf('howto'));
    expect(outcome.foundCount).toBe(SYNC_ENRICH_LIMIT + 1);
  });
});
