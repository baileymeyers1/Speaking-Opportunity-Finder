import type { ScraperResult } from './qualityScore.js';
import {
  fetchWithTimeout,
  htmlToLines,
  mapWithConcurrency,
  parseHumanDate,
  startOfUtcDay,
  stripTags,
  utcDate,
} from './lib/html.js';

/**
 * Pretalx is the CFP platform behind many community and academic conferences.
 * Every instance exposes `GET /api/events/`, a flat JSON list of its public
 * events (verified 2026-11-03: 755 events on pretalx.com, no pagination
 * envelope, no auth). The API carries no CFP data, so each upcoming event's
 * public `/{slug}/cfp` page is fetched: it states "Submissions close on
 * YYYY-MM-DD HH:MM (tz)", "Submissions open on …" or "Submissions closed on …"
 * and renders the submit button disabled when proposals are not accepted.
 * Events with a custom domain redirect there; the final URL is the applyUrl.
 */

export const PRETALX_INSTANCES = [
  // The hosted service; ~80 upcoming events at any time.
  'https://pretalx.com',
  // Self-hosted by the CCC video team for Chaos events. Verified to answer the
  // same API; other well-known self-hosted candidates did not resolve.
  'https://pretalx.c3voc.de',
];

const SOURCE = 'pretalx.com';
const LIST_TIMEOUT_MS = 15_000;
const CFP_TIMEOUT_MS = 10_000;
const CFP_CONCURRENCY = 8;
const DESCRIPTION_MAX_CHARS = 1500;

export interface PretalxEvent {
  slug: string;
  name: string;
  dateFrom: Date;
  dateTo?: Date;
  instanceUrl: string;
}

export type PretalxCfpStatus = 'open' | 'not-yet-open' | 'closed';

export interface PretalxCfpPage {
  title?: string;
  status: PretalxCfpStatus;
  cfpDeadline?: Date;
  opensAt?: Date;
  description?: string;
  /** The page's own og:url; on a custom domain this differs from the pretalx.com URL. */
  canonicalUrl?: string;
}

export interface FetchedCfpPage {
  html: string;
  /** URL after redirects (custom domains). */
  finalUrl?: string;
}

interface RawPretalxEvent {
  name?: Record<string, string> | string;
  slug?: string;
  is_public?: boolean;
  date_from?: string;
  date_to?: string;
}

function parseIsoDay(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  return utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function localizedName(name: RawPretalxEvent['name']): string | undefined {
  if (typeof name === 'string') return name.trim() || undefined;
  if (!name || typeof name !== 'object') return undefined;
  const preferred = name.en ?? Object.values(name)[0];
  return typeof preferred === 'string' && preferred.trim() ? preferred.trim() : undefined;
}

/**
 * Parse `/api/events/`: a flat array, or `{ results: [...] }` on instances that
 * paginate. Keeps public events that have not started, soonest first.
 */
export function parsePretalxEventList(data: unknown, now: Date, instanceUrl: string): PretalxEvent[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)
      ? ((data as { results: unknown[] }).results)
      : [];
  const today = startOfUtcDay(now);

  const events: PretalxEvent[] = [];
  for (const raw of list as RawPretalxEvent[]) {
    if (!raw || typeof raw !== 'object' || raw.is_public === false) continue;
    const slug = raw.slug?.trim();
    const name = localizedName(raw.name);
    const dateFrom = parseIsoDay(raw.date_from);
    if (!slug || !/^[\w-]+$/.test(slug) || !name || !dateFrom || dateFrom < today) continue;
    events.push({ slug, name, dateFrom, dateTo: parseIsoDay(raw.date_to), instanceUrl });
  }

  return events.sort((a, b) => a.dateFrom.getTime() - b.dateFrom.getTime());
}

function metaContent(html: string, property: string): string | undefined {
  const tag = html.match(new RegExp(`<meta\\b[^>]*property=["']?${property}["']?[^>]*>`, 'i'))?.[0];
  const content = tag?.match(/content=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/);
  const value = content ? (content[1] ?? content[2] ?? content[3]).trim() : undefined;
  return value || undefined;
}

/**
 * The status line ("Submissions close on …", "Einreichungen sind bis … möglich")
 * is the `<strong>` right before the submit buttons. Its wording and date format
 * follow the event's locale, so the date is parsed in every format seen live.
 */
const STATUS_LINE = /<strong>([^<]*)<\/strong>\s*(?=<div class=["']?url-links)/i;

function parseStatusDate(text: string): Date | undefined {
  const yearFirst = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (yearFirst) return utcDate(Number(yearFirst[1]), Number(yearFirst[2]) - 1, Number(yearFirst[3]));
  const dotted = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotted) return utcDate(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1]));
  return parseHumanDate(text);
}

/**
 * Parse a public `/{slug}/cfp` page. Open or closed comes from the submit
 * button (disabled when proposals are not accepted), which does not depend on
 * the page language; the status line supplies the deadline.
 */
export function parsePretalxCfpPage(html: string): PretalxCfpPage {
  const submitButton = html.match(/<a\b[^>]*class=["']([^"']*)["'][^>]*href=["']?\/[\w-]+\/submit\/["']?[^>]*>/i);
  const buttonDisabled = !submitButton || /\bdisabled\b/.test(submitButton[1]);
  const statusText = html.match(STATUS_LINE)?.[1]?.trim() ?? '';
  const statusDate = parseStatusDate(statusText);

  let status: PretalxCfpStatus;
  if (!buttonDisabled) status = 'open';
  else if (/Submissions open on/i.test(statusText)) status = 'not-yet-open';
  else status = 'closed';

  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
  const body = main
    .replace(/<div class=["']?page-heading["']?>[\s\S]*?<\/div>/i, '')
    .replace(STATUS_LINE, '')
    .replace(/<div class=["']?url-links["']?>[\s\S]*$/i, '');
  const description = htmlToLines(body).join(' ').slice(0, DESCRIPTION_MAX_CHARS).trim() || undefined;

  const ogTitle = metaContent(html, 'og:title');
  const heading = main.match(/<h2>([\s\S]*?)<\/h2>/i)?.[1];

  return {
    title: ogTitle || (heading ? stripTags(heading) : undefined),
    status,
    cfpDeadline: status === 'open' ? statusDate : undefined,
    opensAt: status === 'not-yet-open' ? statusDate : undefined,
    description,
    canonicalUrl: metaContent(html, 'og:url'),
  };
}

export function pretalxCfpUrl(event: PretalxEvent): string {
  return `${event.instanceUrl}/${event.slug}/cfp`;
}

/**
 * Combine events with their CFP pages. Only CFPs that accept proposals now are
 * kept: a stated deadline must not have passed; a CFP without a deadline is
 * open-ended and kept with no deadline (verification closes it when the page
 * says otherwise).
 */
export function buildPretalxResults(
  events: PretalxEvent[],
  pagesBySlug: ReadonlyMap<string, FetchedCfpPage>,
  now: Date,
): ScraperResult[] {
  const today = startOfUtcDay(now);
  const results: ScraperResult[] = [];

  for (const event of events) {
    const fetched = pagesBySlug.get(event.slug);
    if (!fetched) continue;
    const page = parsePretalxCfpPage(fetched.html);
    if (page.status !== 'open') continue;
    if (page.cfpDeadline && page.cfpDeadline < today) continue;

    results.push({
      title: event.name,
      organization: event.name,
      description: page.description,
      location: null,
      isRemote: false,
      eventDate: event.dateFrom,
      cfpDeadline: page.cfpDeadline,
      format: 'conference',
      industries: [],
      applyUrl: fetched.finalUrl || page.canonicalUrl || pretalxCfpUrl(event),
      source: SOURCE,
      sourceUrl: `${event.instanceUrl}/${event.slug}/`,
    });
  }

  return results;
}

async function scrapeInstance(instanceUrl: string, now: Date): Promise<ScraperResult[]> {
  const response = await fetchWithTimeout(`${instanceUrl}/api/events/`, {
    timeoutMs: LIST_TIMEOUT_MS,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    console.log(`pretalx ${instanceUrl} returned ${response.status}, skipping...`);
    return [];
  }
  const events = parsePretalxEventList(await response.json(), now, instanceUrl);

  const pagesBySlug = new Map<string, FetchedCfpPage>();
  await mapWithConcurrency(events, CFP_CONCURRENCY, async (event) => {
    try {
      const page = await fetchWithTimeout(pretalxCfpUrl(event), {
        timeoutMs: CFP_TIMEOUT_MS,
        headers: { Accept: 'text/html' },
      });
      if (page.ok) pagesBySlug.set(event.slug, { html: await page.text(), finalUrl: page.url || undefined });
    } catch {
      // A slow or failing CFP page only drops that one event.
    }
  });

  const results = buildPretalxResults(events, pagesBySlug, now);
  console.log(
    `pretalx ${instanceUrl}: ${events.length} upcoming events, ${pagesBySlug.size} CFP pages, ${results.length} open calls`,
  );
  return results;
}

export async function scrapePretalx(): Promise<ScraperResult[]> {
  console.log('Fetching open calls from Pretalx instances...');
  const now = new Date();
  const results: ScraperResult[] = [];
  for (const instanceUrl of PRETALX_INSTANCES) {
    try {
      results.push(...(await scrapeInstance(instanceUrl, now)));
    } catch (error) {
      console.error(`Error scraping ${instanceUrl}:`, error instanceof Error ? error.message : error);
    }
  }
  return results;
}
