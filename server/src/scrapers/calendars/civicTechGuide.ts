import { CALENDAR_SOURCES } from '../../services/searchSources.js';
import { stripTags } from '../lib/html.js';
import type { ScraperResult } from '../qualityScore.js';
import { fetchCalendarPage, toScraperResult, worthReading, type CalendarEvent, type CalendarInfo } from './common.js';

/**
 * Civic Tech Field Guide's calendar (civictech.guide/calendar): civic tech,
 * government, nonprofit tech and journalism events, and open calls with their
 * closing dates. CC BY: free to reuse, commercially too, with credit, which
 * the row's source and its link back give. Its Google Calendar feed is barred
 * by calendar.google.com's robots.txt, so the page itself is read.
 *
 * Each card is a date (month and day), a kind (Event, Open call, Funding,
 * Jobs), a title linking to the guide's page for it, and a line of text. Only
 * events and open calls are kept; an open call's date is when it closes.
 */

const LISTING = 'https://civictech.guide/calendar';
const CALENDAR: CalendarInfo = { source: CALENDAR_SOURCES.civicTechGuide, name: 'Civic Tech Field Guide', listingUrl: LISTING };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const KEPT_KINDS = new Set(['event', 'open call']);

/** A month and day without a year: the next one from a week ago, so a card dated today or this week stays this year. */
export function nextDate(month: number, day: number, now: Date): Date {
  const thisYear = new Date(Date.UTC(now.getUTCFullYear(), month, day));
  const weekAgo = now.getTime() - 7 * 86_400_000;
  return thisYear.getTime() >= weekAgo ? thisYear : new Date(Date.UTC(now.getUTCFullYear() + 1, month, day));
}

export function parseCivicTechCalendar(html: string, now: Date = new Date()): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const [card] of html.matchAll(/<article\b[\s\S]*?<\/article>/g)) {
    const spans = [...card.matchAll(/<span\b[^>]*>([^<]*)<\/span>/g)].map((match) => match[1].trim());
    const month = MONTHS.indexOf((spans[0] ?? '').slice(0, 3).toLowerCase());
    const day = Number(spans[1]);
    const kind = (spans[2] ?? '').toLowerCase();
    const link = /<h3\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(card);
    if (month < 0 || !Number.isInteger(day) || !KEPT_KINDS.has(kind) || !link) continue;

    const date = nextDate(month, day, now);
    const text = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(card);
    events.push({
      name: stripTags(link[2]),
      url: new URL(link[1], LISTING).href,
      ...(kind === 'open call' ? { deadline: date } : { startDate: date }),
      description: text ? stripTags(text[1]) || null : null,
      tags: ['civic tech'],
    });
  }
  return events;
}

export async function scrapeCivicTechGuide(now: Date = new Date()): Promise<ScraperResult[]> {
  const events = parseCivicTechCalendar(await fetchCalendarPage(LISTING), now);
  return events.filter((event) => worthReading(event, now)).map((event) => toScraperResult(event, CALENDAR));
}
