import type { ScraperResult } from './qualityScore.js';
import {
  fetchWithTimeout,
  htmlToLines,
  mapWithConcurrency,
  parseHumanDate,
  startOfUtcDay,
  stripTags,
} from './lib/html.js';

/**
 * Sessionize hosts the call for speakers of thousands of conferences and user
 * groups. Its "Discover" listing needs a login (verified 2026-11-03), but every
 * event has a public page at sessionize.com/{slug}/ that states the CFP open and
 * close dates, the event date(s), location, website and description, and the
 * sitemap at /sitemap/events.xml lists all ~11,000 of them newest first.
 * Each run reads the head of the sitemap, so new calls are picked up within a
 * day and recent ones are re-checked; older rows are kept fresh by verification.
 */

const SITEMAP_URL = 'https://sessionize.com/sitemap/events.xml';
const SOURCE = 'sessionize.com';
const SITEMAP_TIMEOUT_MS = 20_000;
const PAGE_TIMEOUT_MS = 10_000;
const PAGE_CONCURRENCY = 8;
export const SESSIONIZE_PAGES_PER_RUN = 80;
const DESCRIPTION_MAX_CHARS = 2000;

export interface SessionizeEventPage {
  title?: string;
  isClosed: boolean;
  opensAt?: Date;
  closesAt?: Date;
  /** Single-date events. */
  eventDate?: Date;
  /** Recurring groups list their planned dates instead of one event date. */
  plannedDates: Date[];
  location?: string;
  isRemote: boolean;
  website?: string;
  description?: string;
}

/** Event page URLs in sitemap order (newest first). */
export function parseSessionizeSitemap(xml: string): string[] {
  const urls: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*(https:\/\/sessionize\.com\/[^<\s]+)\s*<\/loc>/g)) {
    urls.push(match[1]);
  }
  return urls;
}

/** Inner HTML of the `<h2>` that follows a labelled field (`event date`, `location`, …). */
function fieldHtml(html: string, label: string): string | undefined {
  const pattern = new RegExp(`${label}\\s*</div>\\s*<h2\\b[^>]*>([\\s\\S]*?)</h2>`, 'i');
  return html.match(pattern)?.[1];
}

/** The `<h2>` after a "Call opens at …" / "Call closes at …" span. */
function callDate(html: string, label: string): Date | undefined {
  const match = html.match(new RegExp(`${label}[^<]*</span>\\s*</div>\\s*<h2\\b[^>]*>([^<]*)</h2>`, 'i'));
  return match ? parseHumanDate(match[1]) : undefined;
}

function parseDateList(text: string): Date[] {
  return text
    .split(',')
    .map((part) => parseHumanDate(part.trim()))
    .filter((date): date is Date => date !== undefined);
}

/** Text after the first `<hr class="m-t-none" />` inside a column. */
function columnText(html: string, columnId: string): string | undefined {
  const start = html.indexOf(`id="${columnId}"`);
  if (start === -1) return undefined;
  const column = html.slice(start);
  const hr = column.search(/<hr class="m-t-none"\s*\/?>/);
  if (hr === -1) return undefined;
  const afterHr = column.slice(hr);
  // The column's content ends where the next column (or the footer) begins.
  const end = afterHr.search(/<div class="col-md-6 animated|<footer|<div class="footer"/);
  const text = htmlToLines(end === -1 ? afterHr : afterHr.slice(0, end)).join(' ');
  return text || undefined;
}

/** Parse a public sessionize.com/{slug}/ page. */
export function parseSessionizeEventPage(html: string): SessionizeEventPage {
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  const title = titleTag ? stripTags(titleTag).replace(/:\s*Call for Speakers\s*@\s*Sessionize\.com\s*$/i, '').trim() : undefined;

  const isClosed = /Call for Speakers is\s*<strong>\s*closed\s*<\/strong>/i.test(html);

  const locationHtml = fieldHtml(html, 'location');
  const locationParts = locationHtml
    ? [...locationHtml.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => stripTags(m[1])).filter(Boolean)
    : [];
  const locationText = locationParts.length > 0 ? locationParts.join(', ') : locationHtml ? stripTags(locationHtml) : '';
  const isRemote = /^online$/i.test(locationText) || /\bonline\b/i.test(locationText);

  const websiteHtml = fieldHtml(html, 'website');
  const website = websiteHtml?.match(/href="(https?:\/\/[^"]+)"/)?.[1];

  const singleDateHtml = fieldHtml(html, 'event date') ?? fieldHtml(html, 'event starts');
  const plannedHtml = fieldHtml(html, 'planned future dates');

  const left = columnText(html, 'left-column');
  const right = columnText(html, 'right-column');
  const description = [left, right].filter(Boolean).join(' ').slice(0, DESCRIPTION_MAX_CHARS).trim() || undefined;

  return {
    title: title || undefined,
    isClosed,
    opensAt: callDate(html, 'Call opens at'),
    closesAt: callDate(html, 'Call closes at'),
    eventDate: singleDateHtml ? parseHumanDate(stripTags(singleDateHtml)) : undefined,
    plannedDates: plannedHtml ? parseDateList(stripTags(plannedHtml)) : [],
    location: /^online$/i.test(locationText) ? undefined : locationText || undefined,
    isRemote,
    website,
    description,
  };
}

const RECURRING_PATTERN = /\b(user group|meetup|monthly|meet-up)\b/i;

export function inferSessionizeFormat(page: SessionizeEventPage): string {
  const text = `${page.title ?? ''} ${page.description ?? ''}`;
  if (page.plannedDates.length > 0 || RECURRING_PATTERN.test(text)) return 'meetup';
  if (/\bwebinar\b/i.test(page.title ?? '')) return 'webinar';
  return 'conference';
}

/**
 * Map fetched event pages to open calls for speakers: the call is not closed,
 * has opened, its close date has not passed, and the event (or the next planned
 * date) is still ahead.
 */
export function buildSessionizeResults(pagesByUrl: ReadonlyMap<string, string>, now: Date): ScraperResult[] {
  const today = startOfUtcDay(now);
  const results: ScraperResult[] = [];

  for (const [url, html] of pagesByUrl) {
    const page = parseSessionizeEventPage(html);
    if (!page.title || page.isClosed) continue;
    if (page.opensAt && page.opensAt > today) continue;
    if (page.closesAt && page.closesAt < today) continue;

    const nextPlanned = page.plannedDates.filter((date) => date >= today).sort((a, b) => a.getTime() - b.getTime())[0];
    const eventDate = page.eventDate ?? nextPlanned;
    if (page.eventDate && page.eventDate < today) continue;
    if (page.plannedDates.length > 0 && !nextPlanned) continue;

    results.push({
      title: page.title,
      organization: page.title,
      description: page.description,
      location: page.location ?? null,
      isRemote: page.isRemote,
      eventDate,
      cfpDeadline: page.closesAt,
      format: inferSessionizeFormat(page),
      industries: [],
      applyUrl: url,
      source: SOURCE,
      sourceUrl: page.website ?? url,
    });
  }

  return results;
}

export async function scrapeSessionize(): Promise<ScraperResult[]> {
  console.log('Fetching the events sitemap from sessionize.com...');
  try {
    const response = await fetchWithTimeout(SITEMAP_URL, {
      timeoutMs: SITEMAP_TIMEOUT_MS,
      headers: { Accept: 'application/xml,text/xml' },
    });
    if (!response.ok) {
      console.log(`sessionize.com sitemap returned ${response.status}, skipping...`);
      return [];
    }
    const urls = parseSessionizeSitemap(await response.text()).slice(0, SESSIONIZE_PAGES_PER_RUN);

    const pagesByUrl = new Map<string, string>();
    await mapWithConcurrency(urls, PAGE_CONCURRENCY, async (url) => {
      try {
        const page = await fetchWithTimeout(url, { timeoutMs: PAGE_TIMEOUT_MS, headers: { Accept: 'text/html' } });
        if (page.ok) pagesByUrl.set(url, await page.text());
      } catch {
        // A slow or failing page only drops that one event.
      }
    });

    const results = buildSessionizeResults(pagesByUrl, new Date());
    console.log(`sessionize.com: ${urls.length} newest event pages, ${pagesByUrl.size} fetched, ${results.length} open calls`);
    return results;
  } catch (error) {
    console.error('Error scraping sessionize.com:', error instanceof Error ? error.message : error);
    return [];
  }
}
