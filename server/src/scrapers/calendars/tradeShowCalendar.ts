import { decodeHtmlEntities } from '../../services/dataNormalization.js';
import { CALENDAR_SOURCES } from '../../services/searchSources.js';
import { stripTags } from '../lib/html.js';
import type { ScraperResult } from '../qualityScore.js';
import { fetchCalendarPage, toScraperResult, worthReading, type CalendarEvent, type CalendarInfo } from './common.js';

/**
 * The Trade Show Calendar (thetradeshowcalendar.com/tsnn/): the database behind
 * TSNN's calendar and more than 100 associations' white-label calendars. Every
 * row names the show, its dates, venue and city, and links to the show's own
 * site. Measured 2026-11-24: 1,431 US events across 100 industries, 30 rows a
 * page sorted by date, robots.txt allowing /tsnn/, the site "free to use for
 * all visitors".
 *
 * A run reads a few pages of a rotating window, like the Linkup slice, so a
 * day brings the worker about 120 events to read and the whole list comes
 * round every two weeks.
 */

const LISTING = 'https://www.thetradeshowcalendar.com/tsnn/index.php';
export const PAGE_SIZE = 30;
const PAGES_PER_RUN = 4;
/** 60 pages hold 1,800 rows, more than the 1,431 listed; a page past the end comes back empty. */
const WINDOW_PAGES = 60;

const CALENDAR: CalendarInfo = {
  source: CALENDAR_SOURCES.tradeShowCalendar,
  name: 'The Trade Show Calendar',
  listingUrl: 'https://www.thetradeshowcalendar.com/tsnn/',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function pageUrl(page: number): string {
  return `${LISTING}?vShow=search&vCtry=United+States&vRpP=${PAGE_SIZE}&vPos=${page * PAGE_SIZE}`;
}

/** The pages a run reads: a window that moves on each day and wraps round. */
export function pagesForRun(now: Date = new Date()): number[] {
  const day = Math.floor(now.getTime() / 86_400_000);
  return Array.from({ length: PAGES_PER_RUN }, (_, i) => (day * PAGES_PER_RUN + i) % WINDOW_PAGES);
}

/** "NOV/20/2026" as UTC midnight of that day. */
function parseDate(text: string): Date | undefined {
  const match = /([A-Z]{3})\/(\d{2})\/(\d{4})/.exec(text);
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  if (!match || month < 0) return undefined;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
}

function cell(row: string, name: string): string {
  const match = new RegExp(`class='${name}'><div class='r-content'>([\\s\\S]*?)</(?:div|td)>`).exec(row);
  return match ? match[1] : '';
}

/** The events on one page of the calendar. */
export function parseTradeShowPage(html: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const row of html.split(/<tr class="(?:odd|even) row">/).slice(1)) {
    const link = /<a href='([^']+)'[^>]*>([\s\S]*?)<\/a>/.exec(cell(row, 'r-Name'));
    if (!link) continue;
    const href = decodeHtmlEntities(link[1]).trim();
    let url: string;
    try {
      url = new URL(href.startsWith('//') ? `https:${href}` : href).href;
    } catch {
      continue;
    }
    const name = stripTags(link[2]);
    if (!name) continue;
    // "Venue<br>City, ST, United States": the city line, without the country the whole list shares.
    const place = cell(row, 'r-VenLoc').split(/<br\s*\/?>/i).map((line) => stripTags(line)).filter(Boolean);
    const city = place[place.length - 1]?.replace(/,\s*United States$/, '') || null;
    events.push({ name, url, startDate: parseDate(cell(row, 'r-Dates')), location: city });
  }
  return events;
}

export async function scrapeTradeShowCalendar(now: Date = new Date()): Promise<ScraperResult[]> {
  const events: CalendarEvent[] = [];
  for (const page of pagesForRun(now)) {
    events.push(...parseTradeShowPage(await fetchCalendarPage(pageUrl(page))));
  }
  return events.filter((event) => worthReading(event, now)).map((event) => toScraperResult(event, CALENDAR));
}
