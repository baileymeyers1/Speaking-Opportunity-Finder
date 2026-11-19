import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({ prisma: {} }));

import {
  fetchViaReader,
  looksLikeChallengePage,
  markdownToText,
  readerCanHelp,
  readerText,
  readPage,
  READER_URL,
  type ReadPageDeps,
  type ReaderOutcome,
} from './pageReader.js';
import type { PageFetchResult } from './pageText.js';

const URL_UNDER_TEST = 'https://www.icahdq.example/page/call-for-papers';
const PAGE_TEXT = 'Call for Papers: the Communication Law and Policy division invites submissions for the annual conference by 1 December.';
const REFUSED: PageFetchResult = { ok: false, reason: 'http_error', status: 403, message: 'HTTP 403' };

function deps(page: PageFetchResult, reader: ReaderOutcome = { ok: true, text: PAGE_TEXT }, overrides: Partial<ReadPageDeps> = {}) {
  const made = {
    fetchPage: vi.fn(async () => page),
    fetchReader: vi.fn(async () => reader),
    apiKey: 'test-linkup-key' as string | undefined,
    reserveSlot: vi.fn(async () => true),
    ...overrides,
  };
  return made;
}

describe('readPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns our own fetch when it worked, without touching the reader or its cap', async () => {
    const page: PageFetchResult = { ok: true, text: PAGE_TEXT, status: 200 };
    const d = deps(page);
    expect(await readPage(URL_UNDER_TEST, {}, d)).toEqual(page);
    expect(d.reserveSlot).not.toHaveBeenCalled();
    expect(d.fetchReader).not.toHaveBeenCalled();
  });

  it('reads a refused page through the reader, without rendering JavaScript', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const d = deps(REFUSED);
    expect(await readPage(URL_UNDER_TEST, {}, d)).toEqual({ ok: true, text: PAGE_TEXT, status: 200, via: 'reader' });
    expect(d.reserveSlot).toHaveBeenCalledTimes(1);
    expect(d.fetchReader).toHaveBeenCalledWith(URL_UNDER_TEST, {
      apiKey: 'test-linkup-key',
      renderJs: false,
      timeoutMs: 12_000,
      maxChars: 5000,
    });
  });

  it('asks for JavaScript rendering only when our fetch got an empty shell', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const d = deps({ ok: false, reason: 'empty', status: 200, message: 'No readable text (6 chars)' });
    await readPage(URL_UNDER_TEST, {}, d);
    expect(vi.mocked(d.fetchReader).mock.calls[0][1]).toMatchObject({ renderJs: true });
  });

  it('passes on the time and length it was given', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const d = deps(REFUSED);
    await readPage(URL_UNDER_TEST, { timeoutMs: 3000, maxChars: 900, readerTimeoutMs: 8000 }, d);
    expect(d.fetchPage).toHaveBeenCalledWith(URL_UNDER_TEST, { timeoutMs: 3000, maxChars: 900 });
    expect(vi.mocked(d.fetchReader).mock.calls[0][1]).toMatchObject({ timeoutMs: 8000, maxChars: 900 });
  });

  it.each<PageFetchResult>([
    { ok: false, reason: 'gone', status: 404, message: 'HTTP 404' },
    { ok: false, reason: 'gone', status: 410, message: 'HTTP 410' },
    { ok: false, reason: 'network', message: 'fetch failed' },
  ])('leaves a page that is $reason ($message) as it is', async (page) => {
    const d = deps(page);
    expect(await readPage(URL_UNDER_TEST, {}, d)).toEqual(page);
    expect(d.reserveSlot).not.toHaveBeenCalled();
    expect(d.fetchReader).not.toHaveBeenCalled();
  });

  it('does nothing more when the reader is not configured or switched off', async () => {
    const d = deps(REFUSED, undefined, { apiKey: undefined });
    expect(await readPage(URL_UNDER_TEST, {}, d)).toEqual(REFUSED);
    expect(d.reserveSlot).not.toHaveBeenCalled();
  });

  it('stops at the daily cap and says so', async () => {
    const d = deps(REFUSED, undefined, { reserveSlot: vi.fn(async () => false) });
    expect(await readPage(URL_UNDER_TEST, {}, d)).toEqual({ ...REFUSED, message: 'HTTP 403 (reader: daily limit reached)' });
    expect(d.fetchReader).not.toHaveBeenCalled();
  });

  it('keeps the first failure, with the reason of the reader added, when the reader cannot read the page either', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const d = deps(REFUSED, { ok: false, message: 'FETCH_TARGET_NOT_FOUND' });
    // Still "refused", not "gone": a search hit stays unread and no listing is closed on the reader's word.
    expect(await readPage(URL_UNDER_TEST, {}, d)).toEqual({
      ok: false,
      reason: 'http_error',
      status: 403,
      message: 'HTTP 403 (reader: FETCH_TARGET_NOT_FOUND)',
    });
  });

  it('falls back to the first failure when the cap cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps(REFUSED, undefined, { reserveSlot: vi.fn(async () => { throw new Error('database is down'); }) });
    expect(await readPage(URL_UNDER_TEST, {}, d)).toEqual(REFUSED);
    expect(d.fetchReader).not.toHaveBeenCalled();
  });
});

describe('readerCanHelp', () => {
  it('covers refusals, non-HTML files, empty shells and slow pages, nothing else', () => {
    expect(['http_error', 'not_text', 'empty', 'timeout'].every((reason) => readerCanHelp(reason as never))).toBe(true);
    expect(readerCanHelp('gone')).toBe(false);
    expect(readerCanHelp('network')).toBe(false);
  });
});

describe('fetchViaReader', () => {
  const request = { apiKey: 'test-linkup-key', renderJs: false, timeoutMs: 5000, maxChars: 5000 };
  const respond = (body: unknown, status = 200) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })));

  afterEach(() => vi.unstubAllGlobals());

  it('posts the page to the reader with the key, asking for the raw content', async () => {
    respond({ markdown: PAGE_TEXT, rawContent: `<main>${PAGE_TEXT}</main>`, contentType: 'html' });
    await fetchViaReader(URL_UNDER_TEST, { ...request, renderJs: true });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(READER_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-linkup-key' });
    expect(JSON.parse(String(init.body))).toEqual({ url: URL_UNDER_TEST, renderJs: true, includeRawContent: true });
  });

  it('reads an HTML page the way our own fetch does, without navigation and footer', async () => {
    respond({
      markdown: 'ignored',
      contentType: 'html',
      rawContent: `<html><body><nav>Home About Membership Join</nav><main><h1>Call for Papers</h1><p>${PAGE_TEXT}</p></main><footer>Copyright</footer></body></html>`,
    });
    expect(await fetchViaReader(URL_UNDER_TEST, request)).toEqual({ ok: true, text: `Call for Papers ${PAGE_TEXT}` });
  });

  it('reads a PDF call from the markdown the reader made of it', async () => {
    respond({ markdown: `# Call for Proposals\n\n${PAGE_TEXT} See [the guidelines](https://example.org/guidelines.pdf).` });
    expect(await fetchViaReader('https://example.org/call.pdf', request)).toEqual({
      ok: true,
      text: `Call for Proposals ${PAGE_TEXT} See the guidelines.`,
    });
  });

  it('caps the text at the length it was given', async () => {
    respond({ markdown: 'word '.repeat(5000) });
    const outcome = await fetchViaReader(URL_UNDER_TEST, { ...request, maxChars: 800 });
    expect(outcome.ok && outcome.text.length).toBe(800);
  });

  it('reports the code the reader gives when it cannot fetch the page', async () => {
    respond({ error: { code: 'FETCH_TARGET_NOT_FOUND', message: 'The target URL was not found' }, statusCode: 400 }, 400);
    expect(await fetchViaReader(URL_UNDER_TEST, request)).toEqual({ ok: false, message: 'FETCH_TARGET_NOT_FOUND' });
  });

  it('reports the status when the error has no code', async () => {
    respond('upstream error', 502);
    expect(await fetchViaReader(URL_UNDER_TEST, request)).toEqual({ ok: false, message: 'HTTP 502' });
  });

  it('does not count a page with almost no text as read', async () => {
    respond({ markdown: 'Advocu', rawContent: '<div id="root"></div>', contentType: 'html' });
    expect(await fetchViaReader(URL_UNDER_TEST, request)).toEqual({ ok: false, message: 'no readable text (6 chars)' });
  });

  it('does not count a sign-in or anti-bot page as read', async () => {
    respond({
      contentType: 'html',
      rawContent:
        '<main>Google Forms: Sign-in. Sign in to continue to Google Forms. Email or phone. Forgot email? Not your computer? Use a private window to sign in.</main>',
    });
    expect(await fetchViaReader('https://docs.google.example/forms/d/1', request)).toEqual({ ok: false, message: 'got a challenge page' });
  });

  it('gives up at its timeout', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn(async () => { throw timeout; }));
    expect(await fetchViaReader(URL_UNDER_TEST, request)).toEqual({ ok: false, message: 'timed out after 5000ms' });
  });

  it('never throws on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await fetchViaReader(URL_UNDER_TEST, request)).toEqual({ ok: false, message: 'fetch failed' });
  });
});

describe('readerText', () => {
  it('falls back to the markdown when the HTML has almost no visible text', () => {
    expect(readerText({ contentType: 'html', rawContent: '<header>Everything is in the header here</header>', markdown: PAGE_TEXT }, 5000)).toBe(PAGE_TEXT);
  });
});

describe('looksLikeChallengePage', () => {
  it.each([
    'Just a moment... Enable JavaScript and cookies to continue',
    'Attention Required! | Cloudflare. Sorry, you have been blocked',
    'Verifying you are human. This may take a few seconds.',
    'Access Denied. You do not have permission to access this page.',
  ])('recognises "%s"', (text) => {
    expect(looksLikeChallengePage(text)).toBe(true);
  });

  it('does not take a real page that mentions signing in for one', () => {
    const page = `${PAGE_TEXT} `.repeat(20) + 'Members must sign in to continue to the submission form.';
    expect(page.length).toBeGreaterThan(1500);
    expect(looksLikeChallengePage(page)).toBe(false);
    expect(looksLikeChallengePage(PAGE_TEXT)).toBe(false);
  });
});

describe('markdownToText', () => {
  it('keeps the words of links and headings and drops images and emphasis marks', () => {
    expect(markdownToText('## Call for **Speakers**\n\n![logo](https://x.example/logo.png) Submit via [the form](https://x.example/form) by `Dec 1`.')).toBe(
      'Call for Speakers Submit via the form by Dec 1.'
    );
  });
});
