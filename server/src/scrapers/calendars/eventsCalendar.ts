import { decodeHtmlEntities } from '../../services/dataNormalization.js';
import { CALENDAR_SOURCES } from '../../services/searchSources.js';
import { stripTags } from '../lib/html.js';
import type { ScraperResult } from '../qualityScore.js';
import { fetchCalendarPage, toScraperResult, utcDay, worthReading, type CalendarEvent, type CalendarInfo } from './common.js';

/**
 * Calendars on The Events Calendar, the WordPress plugin many associations
 * and trade media use: every such site answers the same JSON API,
 * `/wp-json/tribe/events/v1/events`, with each event's title, dates, venue and
 * its own `website`. One reader serves them all; a site is a line in
 * EVENTS_CALENDAR_SITES once its terms have been read.
 */

export interface EventsCalendarSite extends CalendarInfo {
  /** The site's origin, e.g. https://wdo.org. */
  origin: string;
}

export const EVENTS_CALENDAR_SITES: readonly EventsCalendarSite[] = [
  // World Design Organization: design congresses, design weeks, fairs. No terms found; robots.txt allows all, crawl-delay 60.
  { source: CALENDAR_SOURCES.worldDesignOrganization, name: 'World Design Organization', origin: 'https://wdo.org', listingUrl: 'https://wdo.org/events/' },
];

/** A "website" that is a registration form or a meeting link, not the event's site: the calendar's own page says more. */
const FORM_HOSTS = ['zoom.us', 'hsforms.com', 'hubspot.com', 'forms.gle', 'docs.google.com', 'typeform.com', 'surveymonkey.com', 'airtable.com', 'jotform.com', 'teams.microsoft.com'];

function isForm(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return FORM_HOSTS.some((form) => host === form || host.endsWith(`.${form}`));
  } catch {
    return true;
  }
}

interface ApiEvent {
  title?: string;
  url?: string;
  website?: string;
  start_date?: string;
  is_virtual?: boolean;
  excerpt?: string;
  venue?: { venue?: string; city?: string; state?: string; province?: string; country?: string } | unknown[];
  categories?: Array<{ name?: string }>;
}

type Venue = Exclude<ApiEvent['venue'], unknown[] | undefined>;

function venueOf(event: ApiEvent): Venue | null {
  return event.venue && !Array.isArray(event.venue) ? event.venue : null;
}

function placeOf(venue: Venue | null): string | null {
  if (!venue) return null;
  const parts = [venue.city, venue.state || venue.province, venue.country].map((part) => part?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Sites mark an online event either way: the flag, or a venue named "Online" with the flag left off. */
function isOnline(event: ApiEvent, venue: Venue | null): boolean {
  return event.is_virtual === true || /^(online|virtual)$/i.test(venue?.venue?.trim() ?? '');
}

export function parseEventsCalendar(body: unknown): CalendarEvent[] {
  const events = (body as { events?: ApiEvent[] } | null)?.events;
  if (!Array.isArray(events)) return [];
  const parsed: CalendarEvent[] = [];
  for (const event of events) {
    const name = stripTags(decodeHtmlEntities(event.title ?? ''));
    const website = event.website?.trim();
    const url = website && /^https?:\/\//.test(website) && !isForm(website) ? website : event.url;
    if (!name || !url) continue;
    const venue = venueOf(event);
    parsed.push({
      name,
      url,
      startDate: utcDay(event.start_date),
      location: placeOf(venue),
      isRemote: isOnline(event, venue),
      description: event.excerpt ? stripTags(decodeHtmlEntities(event.excerpt)) || null : null,
      tags: (event.categories ?? []).map((category) => category.name?.toLowerCase().trim() ?? '').filter(Boolean),
    });
  }
  return parsed;
}

export async function scrapeEventsCalendar(site: EventsCalendarSite, now: Date = new Date()): Promise<ScraperResult[]> {
  const today = now.toISOString().slice(0, 10);
  const url = `${site.origin}/wp-json/tribe/events/v1/events?per_page=50&start_date=${today}`;
  const events = parseEventsCalendar(JSON.parse(await fetchCalendarPage(url, 'application/json')));
  return events.filter((event) => worthReading(event, now)).map((event) => toScraperResult(event, site));
}
