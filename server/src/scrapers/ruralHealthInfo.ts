import type { ScraperResult } from './qualityScore.js';
import { fetchWithTimeout, monthIndex, parseHumanDate, startOfUtcDay, stripTags, utcDate } from './lib/html.js';
import { endOfCalendarDay } from '../lib/deadlines.js';
import { isFileUrl } from '../services/dataNormalization.js';

/**
 * The Rural Health Information Hub (funded by the US Federal Office of Rural
 * Health Policy) keeps a staff-maintained list of health conferences that are
 * asking for presenters: ruralhealthinfo.org/events/calls, ten events a page.
 * Each entry states the event, its dates, organizer, venue and city, and one
 * or more calls ("Call for Proposals", "Call for Abstracts", …) with the link
 * to submit and the deadline. Verified 2026-11-18: 20 open calls on 2 pages,
 * robots.txt allows /events/, no login.
 *
 * The listing has no description and no timezone, so the deadline is read as
 * the end of the stated day Anywhere on Earth and enrichment fills the rest
 * from the call's own page.
 */

export const RURAL_HEALTH_LISTING_URL = 'https://www.ruralhealthinfo.org/events/calls';
const SOURCE = 'ruralhealthinfo.org';
const PAGE_TIMEOUT_MS = 10_000;
/** Ten events a page; the listing has never been seen past three pages. */
export const RURAL_HEALTH_MAX_PAGES = 6;
const INDUSTRIES = ['healthcare', 'rural health'];

export interface RuralHealthCall {
  /** "Call for Proposals", "Call for Abstracts", … as the listing words it. */
  label: string;
  /** Where to submit; absent when the listing names the call without a link. */
  url?: string;
  /** The stated closing day, as UTC midnight. */
  deadline?: Date;
}

export interface RuralHealthEvent {
  title: string;
  /** The event's own page. */
  eventUrl: string;
  organization?: string;
  /** The date line as listed: "Apr 14 - 16, 2027". */
  dateText?: string;
  eventStart?: Date;
  eventEnd?: Date;
  venue?: string;
  /** "Englewood, CO". */
  location?: string;
  isRemote: boolean;
  calls: RuralHealthCall[];
}

const ENTRY_START = '<div class="pad-bottom margin-bottom">';
const VIRTUAL_PATTERN = /^(virtual|online|webinar)\b/i;
/** A poster is shown, not presented from a stage: a call for posters alone is not a call for speakers. */
const POSTER_ONLY_PATTERN = /^call for (?:research |scientific )?posters?$/i;

interface DayMonthYear {
  day: number;
  month?: number;
  year?: number;
}

function parseDatePart(text: string): DayMonthYear | undefined {
  const match = text.trim().match(/^(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!match) return undefined;
  const month = match[1] ? monthIndex(match[1]) : undefined;
  if (match[1] && month === undefined) return undefined;
  return { day: Number(match[2]), month, year: match[3] ? Number(match[3]) : undefined };
}

/**
 * The listing's date line: "Apr 15, 2027", "Apr 14 - 16, 2027",
 * "Apr 30 - May 1, 2027" or "Dec 30, 2026 - Jan 2, 2027". The year is always
 * on the end date; a start month later than the end month belongs to the
 * year before.
 */
export function parseEventDateRange(text: string): { start?: Date; end?: Date } {
  const parts = text.split(/\s+[-–—]\s+/);
  if (parts.length > 2) return {};
  const last = parseDatePart(parts[parts.length - 1]);
  if (!last || last.year === undefined) return {};

  if (parts.length === 1) {
    if (last.month === undefined) return {};
    const day = utcDate(last.year, last.month, last.day);
    return { start: day, end: day };
  }

  const first = parseDatePart(parts[0]);
  if (!first || first.month === undefined) return {};
  const endMonth = last.month ?? first.month;
  const startYear = first.year ?? (first.month > endMonth ? last.year - 1 : last.year);
  return {
    start: utcDate(startYear, first.month, first.day),
    end: utcDate(last.year, endMonth, last.day),
  };
}

function attribute(tag: string, name: string): string | undefined {
  const value = tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  return value ? stripTags(value) : undefined;
}

function httpUrl(value: string | undefined): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined;
}

/** Each `<strong>` in the calls block is one call: "<a href=…>Call for Proposals</a> - Deadline: Nov 20, 2026". */
function parseCalls(callsHtml: string): RuralHealthCall[] {
  const calls: RuralHealthCall[] = [];
  for (const [, inner] of callsHtml.matchAll(/<strong>([\s\S]*?)<\/strong>/g)) {
    const text = stripTags(inner);
    const [labelText, deadlineText] = text.split(/\s+-\s+Deadline:\s*/i);
    const label = labelText.trim();
    if (!/^call\b/i.test(label)) continue;
    const linkTag = inner.match(/<a\b[^>]*>/)?.[0];
    calls.push({
      label,
      url: httpUrl(linkTag ? attribute(linkTag, 'href') : undefined),
      deadline: deadlineText ? parseHumanDate(deadlineText) : undefined,
    });
  }
  return calls;
}

function parseEntry(entryHtml: string): RuralHealthEvent | undefined {
  const [headHtml, callsHtml = ''] = entryHtml.split(/<blockquote\b[^>]*>/);
  const titleLink = headHtml.match(/(<a\b[^>]*\bclass="bold"[^>]*>)([\s\S]*?)<\/a>/);
  if (!titleLink) return undefined;
  const title = stripTags(titleLink[2]);
  const eventUrl = httpUrl(attribute(titleLink[1], 'href'));
  if (!title || !eventUrl) return undefined;

  const organization = headHtml.match(/<span class="source">([\s\S]*?)<\/span>/)?.[1];
  // What is left once the title, the scope badge ("National") and the organizer
  // are taken out is the date line followed by the venue and the city.
  const lines = headHtml
    .replace(titleLink[0], '')
    .replace(/<span class="(?:noticepale|source)">[\s\S]*?<\/span>/g, '')
    .split(/<br\s*\/?>/i)
    .map((line) => stripTags(line))
    .filter(Boolean);
  const [dateText, ...place] = lines;
  const { start, end } = dateText ? parseEventDateRange(dateText) : {};
  const isRemote = place.some((line) => VIRTUAL_PATTERN.test(line));
  const physical = place.filter((line) => !VIRTUAL_PATTERN.test(line));

  return {
    title,
    eventUrl,
    organization: organization ? stripTags(organization) || undefined : undefined,
    dateText,
    eventStart: start,
    eventEnd: end,
    venue: physical.length > 1 ? physical.slice(0, -1).join(', ') : undefined,
    location: physical.length > 0 ? physical[physical.length - 1] : undefined,
    isRemote,
    calls: parseCalls(callsHtml.split(/<\/blockquote>/i)[0]),
  };
}

/** The events on one page of the listing, in page order (soonest deadline first). */
export function parseRuralHealthCallsPage(html: string): RuralHealthEvent[] {
  const start = html.indexOf('id="narrowing-page"');
  if (start === -1) return [];
  const end = html.indexOf('</main>', start);
  const listing = end === -1 ? html.slice(start) : html.slice(start, end);
  return listing
    .split(ENTRY_START)
    .slice(1)
    .map((entry) => parseEntry(entry.split(/<nav\b/i)[0]))
    .filter((event): event is RuralHealthEvent => event !== undefined);
}

/** Whether the pager links a following page. */
export function hasNextRuralHealthPage(html: string): boolean {
  return /<a\b[^>]*\brel="next"/i.test(html);
}

function describe(event: RuralHealthEvent, call: RuralHealthCall): string {
  const where = [event.venue, event.location].filter(Boolean).join(', ');
  const when = event.dateText ? `, ${event.dateText}` : '';
  const place = where ? `, ${where}` : event.isRemote ? ', held online' : '';
  const organizer = event.organization ? ` Organized by ${event.organization.replace(/\.$/, '')}.` : '';
  return `${call.label} for the ${event.title}${when}${place}.${organizer}`;
}

/**
 * One result per event: its first call that asks for presenters (not posters
 * alone) and has not closed. The apply URL is the call's link, or the event's
 * own page when that link is a file (some calls are a PDF, which is no page
 * to apply on and is dropped at persistence) or is already taken: two events
 * can share one submission form (the NRHA runs its annual conference and a
 * summit off the same one), and both stay.
 */
export function buildRuralHealthResults(events: readonly RuralHealthEvent[], now: Date): ScraperResult[] {
  const today = startOfUtcDay(now);
  const results: ScraperResult[] = [];
  const usedUrls = new Set<string>();

  for (const event of events) {
    const lastDay = event.eventEnd ?? event.eventStart;
    if (lastDay && lastDay < today) continue;
    const call = event.calls.find(
      (candidate) => !POSTER_ONLY_PATTERN.test(candidate.label) && !(candidate.deadline && candidate.deadline < today),
    );
    if (!call) continue;

    const applyUrl = [call.url, event.eventUrl].find(
      (url): url is string => url !== undefined && !isFileUrl(url) && !usedUrls.has(url),
    );
    if (!applyUrl) continue;
    usedUrls.add(applyUrl);

    results.push({
      title: event.title,
      organization: event.organization ?? event.title,
      description: describe(event, call),
      location: event.location ?? null,
      isRemote: event.isRemote,
      eventDate: event.eventStart,
      // The listing states a day and no zone: read as Anywhere on Earth.
      cfpDeadline: endOfCalendarDay(call.deadline),
      deadlineTimezone: null,
      format: 'conference',
      industries: INDUSTRIES,
      applyUrl,
      source: SOURCE,
      sourceUrl: event.eventUrl,
    });
  }

  return results;
}

export async function scrapeRuralHealthInfo(): Promise<ScraperResult[]> {
  console.log('Fetching open calls for presentations from ruralhealthinfo.org...');
  try {
    const events: RuralHealthEvent[] = [];
    let pages = 0;
    for (let page = 1; page <= RURAL_HEALTH_MAX_PAGES; page++) {
      const url = page === 1 ? RURAL_HEALTH_LISTING_URL : `${RURAL_HEALTH_LISTING_URL}?page=${page}`;
      const response = await fetchWithTimeout(url, { timeoutMs: PAGE_TIMEOUT_MS, headers: { Accept: 'text/html' } });
      if (!response.ok) {
        console.log(`ruralhealthinfo.org page ${page} returned ${response.status}, stopping...`);
        break;
      }
      const html = await response.text();
      pages++;
      events.push(...parseRuralHealthCallsPage(html));
      if (!hasNextRuralHealthPage(html)) break;
    }

    const results = buildRuralHealthResults(events, new Date());
    console.log(`ruralhealthinfo.org: ${pages} pages, ${events.length} events listed, ${results.length} open calls`);
    return results;
  } catch (error) {
    console.error('Error scraping ruralhealthinfo.org:', error instanceof Error ? error.message : error);
    return [];
  }
}
