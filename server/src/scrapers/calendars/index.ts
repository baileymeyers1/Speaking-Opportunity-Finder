import type { ScraperDefinition } from '../index.js';
import { persistCalendarResults } from './common.js';
import { scrapeTradeShowCalendar } from './tradeShowCalendar.js';
import { scrapeCivicTechGuide } from './civicTechGuide.js';
import { EVENTS_CALENDAR_SITES, scrapeEventsCalendar } from './eventsCalendar.js';

/**
 * Industry calendars (docs/plans/2026-11-24-industry-calendars.md): lists of
 * events, each stored as a link to its own page for the worker to read. They
 * are written insert-only (common.ts), so a calendar never relabels a row a
 * CFP listing holds.
 */
export const CALENDAR_SCRAPERS: ScraperDefinition[] = [
  // Four 30-row pages of a rotating window: the 1,400 US shows come round every two weeks.
  { name: 'thetradeshowcalendar.com', cadence: 'daily', run: () => scrapeTradeShowCalendar(), persist: persistCalendarResults },
  // One page, a month or two of events and open calls.
  { name: 'civictech.guide', cadence: 'daily', run: () => scrapeCivicTechGuide(), persist: persistCalendarResults },
  // One API call a site; a handful of new events a week.
  ...EVENTS_CALENDAR_SITES.map((site): ScraperDefinition => ({
    name: site.source,
    cadence: 'weekly',
    run: () => scrapeEventsCalendar(site),
    persist: persistCalendarResults,
  })),
];
