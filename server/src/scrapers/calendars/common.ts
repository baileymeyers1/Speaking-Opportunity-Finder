import { prisma } from '../../lib/prisma.js';
import { endOfCalendarDay } from '../../lib/deadlines.js';
import { robotsAllows } from '../../services/robots.js';
import { isJunkResult } from '../../services/dataNormalization.js';
import { buildCreateData } from '../persistData.js';
import { fetchWithTimeout } from '../lib/html.js';
import type { PersistOptions, PersistSummary } from '../persistResults.js';
import type { ScraperResult } from '../qualityScore.js';

/**
 * What the calendar readers share. A calendar (docs/plans/2026-11-24-industry-
 * calendars.md) lists events, not calls: each entry becomes a row pointing at
 * the event's own page, hidden until that page is read (a calendar's source is
 * a search source, services/searchSources.ts). The worker then lists it as an
 * open call, an event to watch, or nothing, and follows its call page.
 */

export interface CalendarEvent {
  name: string;
  /** The event's own site when the calendar gives one, else the calendar's page for it. */
  url: string;
  /** The first day of the event, as UTC midnight of that day. */
  startDate?: Date;
  location?: string | null;
  isRemote?: boolean;
  /** The last day to apply, when the calendar lists a call with its closing date. */
  deadline?: Date;
  description?: string | null;
  tags?: string[];
}

export interface CalendarInfo {
  /** The calendar's site: the scraper's name and the rows' source. */
  source: string;
  /** Its human name, for a row's description. */
  name: string;
  /** The page a row was listed on, kept in `sourceUrl`. */
  listingUrl: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Calls close months before the event: one starting this soon has nothing left to apply to. */
export const MIN_LEAD_DAYS = 30;
/** Further out than this, no call is open yet and the date is often a placeholder. */
export const MAX_LEAD_DAYS = 550;

/** Worth a row: a call whose deadline has not passed, or an event between one month and about eighteen months away. */
export function worthReading(event: CalendarEvent, now: Date): boolean {
  if (event.deadline) return event.deadline.getTime() >= now.getTime() - DAY_MS;
  if (!event.startDate) return true;
  const daysAway = (event.startDate.getTime() - now.getTime()) / DAY_MS;
  return daysAway >= MIN_LEAD_DAYS && daysAway <= MAX_LEAD_DAYS;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function toScraperResult(event: CalendarEvent, calendar: CalendarInfo): ScraperResult {
  return {
    title: event.name,
    organization: hostOf(event.url),
    description: event.description || `Listed on ${calendar.name}`,
    location: event.location ?? null,
    isRemote: event.isRemote ?? false,
    eventDate: event.startDate,
    // A closing day with no zone: the end of that day, read as AoE (lib/deadlines.ts).
    cfpDeadline: endOfCalendarDay(event.deadline),
    format: 'other',
    industries: event.tags ?? [],
    applyUrl: event.url,
    source: calendar.source,
    sourceUrl: calendar.listingUrl,
  };
}

/** A calendar page, when the site's robots.txt lets every crawler read it. */
export async function fetchCalendarPage(url: string, accept = 'text/html,application/xhtml+xml'): Promise<string> {
  if (!(await robotsAllows(url))) throw new Error(`robots.txt does not allow reading ${url}`);
  const response = await fetchWithTimeout(url, { timeoutMs: 15_000, headers: { Accept: accept } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

/** A calendar date "YYYY-MM-DD" (or the start of a longer string) as UTC midnight; undefined when it is not one. */
export function utcDay(value: string | null | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return undefined;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Stores a calendar's new entries and leaves every stored address as it is.
 * The usual scraper persistence refreshes a stored row and merges a row of the
 * same name, rewriting its source: a calendar listing an event a trusted CFP
 * listing already holds would turn that row into an unread link and hide it.
 * A new row gets its event once the worker has read it (backgroundEnrichment).
 */
export async function persistCalendarResults(results: ScraperResult[], options: PersistOptions = {}): Promise<PersistSummary> {
  const kept = results.filter((result) => !isJunkResult(result));
  if (kept.length === 0) return { added: 0, updated: 0, deferred: 0 };
  const stored = await prisma.opportunity.findMany({
    where: { applyUrl: { in: kept.map((result) => result.applyUrl) } },
    select: { applyUrl: true },
  });
  const known = new Set(stored.map((row) => row.applyUrl));
  const fresh = kept.filter((result) => !known.has(result.applyUrl));
  if (fresh.length === 0) return { added: 0, updated: 0, deferred: 0 };
  if (Date.now() >= (options.deadline ?? Number.POSITIVE_INFINITY)) return { added: 0, updated: 0, deferred: fresh.length };
  const { count } = await prisma.opportunity.createMany({ data: fresh.map(buildCreateData), skipDuplicates: true });
  return { added: count, updated: 0, deferred: 0 };
}
