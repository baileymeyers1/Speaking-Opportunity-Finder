import { config } from '../config/index.js';
import { prisma } from '../lib/prisma.js';
import { PAGE_READER_DAILY_LIMIT, reservePageReaderSlot } from './enrichmentBudget.js';
import {
  DEFAULT_PAGE_MAX_CHARS,
  fetchPageText,
  MIN_READABLE_PAGE_CHARS,
  visibleText,
  type PageFetchFailure,
  type PageFetchResult,
} from './pageText.js';
import { linksFromHtml, linksFromMarkdown, type PageLink } from './pageLinks.js';

/**
 * Reads an opportunity's page for extraction: our own fetch first, and when
 * that is refused, Linkup's fetch endpoint (the same key as search).
 *
 * About a third of search hits sit on sites that answer a plain fetch with
 * 403. Measured on 2026-11-19 on one page from each of the 30 hosts that
 * blocked us most: Linkup read 20 without rendering JavaScript, 1 more with
 * it (a sign-in page), and 7 not at all. It also turns a PDF call into text.
 * A call costs $0.001 ($0.005 with JavaScript), nothing when it fails, and is
 * counted against a daily cap kept in the database (enrichmentBudget.ts).
 *
 * The enrichment worker, verification and live search all read through
 * `readPage`, so a page is readable or not in the same way everywhere.
 */

export const READER_URL = 'https://api.linkup.so/v1/fetch';
export const DEFAULT_READER_TIMEOUT_MS = 12_000;

export type PageReadResult = PageFetchResult & {
  /** Set when the text came through the reader rather than our own fetch. */
  via?: 'reader';
};

/**
 * Failures the reader can get past: a refusal, a file that is not HTML (a PDF
 * call), the empty shell of a JavaScript app, a page too slow for our
 * timeout. Not a page that is gone (404/410 closes the listing), and not a
 * host that cannot be reached: the reader cannot reach it either and takes
 * 7 to 18 seconds to say so.
 */
const READER_FALLBACK_REASONS: readonly PageFetchFailure[] = ['http_error', 'not_text', 'empty', 'timeout'];

export function readerCanHelp(reason: PageFetchFailure): boolean {
  return READER_FALLBACK_REASONS.includes(reason);
}

export type ReaderOutcome = { ok: true; text: string; links?: PageLink[] } | { ok: false; message: string };

export interface ReaderRequest {
  apiKey: string;
  /** Render the page's JavaScript first. Five times the price, so only for an empty shell. */
  renderJs: boolean;
  timeoutMs: number;
  maxChars: number;
}

/** Markdown as plain text: links and images reduced to their words, so the character budget goes to content. */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A reader that got an anti-bot or sign-in page instead of the page itself.
 * Taken as "not read": handing it to the extraction would have the page
 * judged as not an event, and a search hit judged that way is dropped for good.
 */
const CHALLENGE_PATTERNS: readonly RegExp[] = [
  /\bjust a moment\b/i,
  /\bchecking (if the site connection is secure|your browser)\b/i,
  /\bverify(ing)? (that )?you are (a )?human\b/i,
  /\benable javascript and cookies to continue\b/i,
  /\battention required\b/i,
  /\baccess denied\b/i,
  /\bsign in to continue\b/i,
  /\bare you a robot\b/i,
  /\bcaptcha\b/i,
];
const CHALLENGE_MAX_CHARS = 1500;

export function looksLikeChallengePage(text: string): boolean {
  return text.length <= CHALLENGE_MAX_CHARS && CHALLENGE_PATTERNS.some((pattern) => pattern.test(text));
}

interface ReaderResponseBody {
  markdown?: unknown;
  rawContent?: unknown;
  contentType?: unknown;
}

/**
 * The page's text from a reader response. HTML goes through the same
 * `visibleText` as our own fetch (navigation, header and footer dropped);
 * anything else, a PDF for one, comes as the reader's markdown.
 */
export function readerText(body: ReaderResponseBody, maxChars: number): string {
  const isHtml = typeof body.contentType === 'string' && /html/i.test(body.contentType);
  if (isHtml && typeof body.rawContent === 'string') {
    const text = visibleText(body.rawContent, maxChars);
    if (text.length >= MIN_READABLE_PAGE_CHARS) return text;
  }
  return typeof body.markdown === 'string' ? markdownToText(body.markdown).slice(0, maxChars) : '';
}

/** The page's links from a reader response: its raw HTML when it sent some, else its markdown. */
export function readerLinks(body: ReaderResponseBody, url: string): PageLink[] {
  if (typeof body.rawContent === 'string' && typeof body.contentType === 'string' && /html/i.test(body.contentType)) {
    return linksFromHtml(body.rawContent, url);
  }
  return typeof body.markdown === 'string' ? linksFromMarkdown(body.markdown, url) : [];
}

async function readerErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    if (typeof body.error?.code === 'string') return body.error.code;
  } catch {
    // Not JSON: the status says enough.
  }
  return `HTTP ${response.status}`;
}

/** One call to the reader. Never throws; a failure says why in a few words. */
export async function fetchViaReader(url: string, request: ReaderRequest): Promise<ReaderOutcome> {
  try {
    const response = await fetch(READER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${request.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, renderJs: request.renderJs, includeRawContent: true }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    if (!response.ok) return { ok: false, message: await readerErrorCode(response) };

    const body = (await response.json()) as ReaderResponseBody;
    const text = readerText(body, request.maxChars);
    if (text.length < MIN_READABLE_PAGE_CHARS) return { ok: false, message: `no readable text (${text.length} chars)` };
    if (looksLikeChallengePage(text)) return { ok: false, message: 'got a challenge page' };
    return { ok: true, text, links: readerLinks(body, url) };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      ok: false,
      message: timedOut ? `timed out after ${request.timeoutMs}ms` : error instanceof Error ? error.message : 'request failed',
    };
  }
}

export interface ReadPageOptions {
  timeoutMs?: number;
  maxChars?: number;
  /** How long the reader may take; a live search gives it less than the worker does. */
  readerTimeoutMs?: number;
}

export interface ReadPageDeps {
  fetchPage: typeof fetchPageText;
  fetchReader: typeof fetchViaReader;
  /** The reader's key; undefined when it is not configured or switched off. */
  apiKey: string | undefined;
  /** Takes one call from today's cap; false when the cap is spent. */
  reserveSlot: () => Promise<boolean>;
}

function defaultDeps(): ReadPageDeps {
  return {
    fetchPage: fetchPageText,
    fetchReader: fetchViaReader,
    apiKey: PAGE_READER_DAILY_LIMIT > 0 ? config.scrapers?.webSearch : undefined,
    reserveSlot: async () => (await reservePageReaderSlot(prisma)).reserved,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * The text of a page: our own fetch, then the reader when the failure is one
 * it can get past and today's cap allows. A page the reader cannot read
 * either keeps the first failure, with the reader's reason added
 * ("HTTP 403 (reader: FETCH_TARGET_NOT_FOUND)"), so the caller treats it
 * exactly as before: a search hit stays unread, a gone page stays gone.
 */
export async function readPage(
  url: string,
  options: ReadPageOptions = {},
  deps: ReadPageDeps = defaultDeps()
): Promise<PageReadResult> {
  const { readerTimeoutMs = DEFAULT_READER_TIMEOUT_MS, ...fetchOptions } = options;
  const page = await deps.fetchPage(url, fetchOptions);
  if (page.ok || !deps.apiKey || !readerCanHelp(page.reason)) return page;

  let reserved: boolean;
  try {
    reserved = await deps.reserveSlot();
  } catch (error) {
    console.error('[PageReader] Could not reserve a reader call:', error instanceof Error ? error.message : error);
    return page;
  }
  if (!reserved) return { ...page, message: `${page.message} (reader: daily limit reached)` };

  const outcome = await deps.fetchReader(url, {
    apiKey: deps.apiKey,
    renderJs: page.reason === 'empty',
    timeoutMs: readerTimeoutMs,
    maxChars: options.maxChars ?? DEFAULT_PAGE_MAX_CHARS,
  });
  if (!outcome.ok) {
    console.log(`[PageReader] ${hostOf(url)}: ${page.message}, and the reader could not read it either (${outcome.message})`);
    return { ...page, message: `${page.message} (reader: ${outcome.message})` };
  }
  console.log(`[PageReader] ${hostOf(url)}: ${page.message}, read through the reader (${outcome.text.length} chars)`);
  return { ok: true, text: outcome.text, status: 200, via: 'reader', links: outcome.links };
}
