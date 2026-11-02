/**
 * Small, dependency-free HTML helpers shared by the HTML/RSS scrapers.
 * Regex-based on purpose: scraped pages are parsed into a handful of fields,
 * not rendered, so a full DOM parser is not worth the dependency.
 */
import { decodeHtmlEntities } from '../../services/dataNormalization.js';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const BLOCK_TAGS =
  'address|article|aside|blockquote|br|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul';

const BLOCK_TAG_PATTERN = new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi');

function removeNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
}

/** Collapse runs of spaces/tabs (and nbsp) to one space without touching newlines. */
function collapseInlineWhitespace(text: string): string {
  return text.replace(/[^\S\n]+/g, ' ');
}

/** Remove all tags, decode entities and collapse all whitespace to single spaces. */
export function stripTags(html: string): string {
  const withoutTags = removeNonContent(html).replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

/**
 * Convert HTML into visible text lines: script/style removed, block-level tags
 * become line breaks, entities decoded, spaces collapsed, newlines preserved,
 * empty lines dropped.
 */
export function htmlToLines(html: string): string[] {
  const withBreaks = removeNonContent(html)
    .replace(/\r\n?/g, '\n')
    // Source newlines inside inline content are just whitespace in HTML.
    .replace(/\n/g, ' ')
    .replace(BLOCK_TAG_PATTERN, '\n')
    .replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(withBreaks)
    .split('\n')
    .map((line) => collapseInlineWhitespace(line).trim())
    .filter((line) => line.length > 0);
}

export interface FetchWithTimeoutOptions {
  timeoutMs: number;
  headers?: Record<string, string>;
}

/** fetch() with an AbortController timeout and a browser-like User-Agent. */
export async function fetchWithTimeout(
  url: string,
  { timeoutMs, headers = {} }: FetchWithTimeoutOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT, ...headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run `worker` over `items` with at most `concurrency` in flight.
 * Results keep input order.
 */
export async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  worker: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Month name or abbreviation ("Nov", "November", "Sept") to 0-based index. */
export function monthIndex(name: string): number | undefined {
  const lower = name.trim().replace(/\.$/, '').toLowerCase();
  if (lower.length < 3) return undefined;
  const index = MONTH_NAMES.findIndex((month) => month.startsWith(lower));
  return index === -1 ? undefined : index;
}

/** Build a UTC-midnight date, rejecting impossible values like Feb 31. */
export function utcDate(year: number, month: number, day: number): Date | undefined {
  if (!Number.isFinite(year) || !Number.isFinite(day) || month < 0 || month > 11) return undefined;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return undefined;
  return date;
}

/** UTC midnight of the day containing `now`; deadlines on that day still count as open. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Parse the human-readable date formats the scraped sources use:
 * "10th November 2026", "10 Nov 2026", "Nov 13, 2026", "November 13 2026", "2026-11-13".
 * Returns UTC midnight, or undefined when the text holds no valid date.
 */
export function parseHumanDate(text: string): Date | undefined {
  const iso = text.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (dayFirst) {
    const month = monthIndex(dayFirst[2]);
    if (month !== undefined) return utcDate(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }

  const monthFirst = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (monthFirst) {
    const month = monthIndex(monthFirst[1]);
    if (month !== undefined) return utcDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }

  return undefined;
}
