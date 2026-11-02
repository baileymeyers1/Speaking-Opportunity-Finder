import type { ScraperResult } from './qualityScore.js';
import {
  fetchWithTimeout,
  mapWithConcurrency,
  monthIndex,
  parseHumanDate,
  startOfUtcDay,
  stripTags,
  utcDate,
} from './lib/html.js';

/**
 * conferencealerts.com lists academic/professional conferences by country.
 * The listing page has no deadline information, so each upcoming event's
 * detail page is fetched and only events with a real
 * "Deadline for abstracts/proposals" that has not passed are kept.
 * (Roughly half of the detail pages have no deadline at all.)
 */

const BASE_URL = 'https://conferencealerts.com/';
const LISTING_URL = `${BASE_URL}country-listing.php?country=United+States+of+America&ipp=All&page=1`;
const SOURCE = 'conferencealerts.com';
const LISTING_TIMEOUT_MS = 20_000;
const DETAIL_TIMEOUT_MS = 10_000;
const DETAIL_CONCURRENCY = 4;

export interface ConferenceAlertsListing {
  eventId: string;
  title: string;
  detailUrl: string;
  eventDate: Date;
  location?: string;
  isRemote: boolean;
}

export interface ConferenceAlertsDetail {
  title?: string;
  cfpDeadline?: Date;
  website?: string;
  description?: string;
  organiser?: string;
  location?: string;
  isRemote?: boolean;
}

const LISTING_TOKEN =
  /<strong>\s*([A-Za-z]+)\s+(\d{4})\s*<\/strong>|<tr>\s*<td class="textLeft bold"[^>]*>\s*(\d{1,2})(?:st|nd|rd|th)?\s*<\/td>([\s\S]*?)<\/tr>/g;

function shortenCountry(place: string): string {
  return place.replace(/,?\s*United States of America\s*$/i, ', United States').replace(/^,\s*/, '');
}

function badgeIsRemote(html: string): boolean {
  return /class="(?:online-badge|online-in-person-badge)"/.test(html);
}

/** Parse the country listing into upcoming events (event date on or after today). */
export function parseConferenceAlertsListing(html: string, now: Date): ConferenceAlertsListing[] {
  const tableStart = html.indexOf('id="searchResultTable"');
  if (tableStart === -1) return [];
  const table = html.slice(tableStart);
  const today = startOfUtcDay(now);

  const listings: ConferenceAlertsListing[] = [];
  const seenIds = new Set<string>();
  let currentMonth: number | undefined;
  let currentYear: number | undefined;

  for (const match of table.matchAll(LISTING_TOKEN)) {
    if (match[1]) {
      currentMonth = monthIndex(match[1]);
      currentYear = Number(match[2]);
      continue;
    }
    if (currentMonth === undefined || currentYear === undefined) continue;

    const cell = match[4];
    const anchor = cell.match(/<a\b[^>]*href="show-event\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!anchor || anchor[1] === '0' || seenIds.has(anchor[1])) continue;

    const eventDate = utcDate(currentYear, currentMonth, Number(match[3]));
    if (!eventDate || eventDate < today) continue;

    const title = stripTags(anchor[2]);
    if (!title) continue;

    const place = cell.match(/<span id="searchPlace"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/);
    seenIds.add(anchor[1]);
    listings.push({
      eventId: anchor[1],
      title,
      detailUrl: new URL(`show-event?id=${anchor[1]}`, BASE_URL).toString(),
      eventDate,
      location: place ? shortenCountry(stripTags(place[1])) || undefined : undefined,
      isRemote: badgeIsRemote(cell),
    });
  }

  return listings;
}

function spanText(html: string, id: string): string | undefined {
  const match = html.match(new RegExp(`<span id="${id}"[^>]*>([\\s\\S]*?)</span>\\s*(?:<br|$)`));
  if (!match) return undefined;
  const text = stripTags(match[1]);
  return text || undefined;
}

/** Parse a show-event detail page. */
export function parseConferenceAlertsDetail(html: string): ConferenceAlertsDetail {
  const deadlineText = spanText(html, 'eventDeadline');
  const websiteMatch = html.match(/<span id="eventWebsite">[\s\S]*?<a\b[^>]*href="(https?:\/\/[^"]+)"/);
  const organiser = spanText(html, 'eventOrganiser')?.replace(/^Organized by:\s*/i, '');
  const location = spanText(html, 'eventCountry');

  return {
    title: spanText(html, 'eventNameHeader'),
    cfpDeadline: deadlineText ? parseHumanDate(deadlineText.replace(/^[^:]*:\s*/, '')) : undefined,
    website: websiteMatch ? websiteMatch[1] : undefined,
    description: spanText(html, 'eventDescription'),
    organiser: organiser || undefined,
    location: location ? shortenCountry(location) : undefined,
    isRemote: badgeIsRemote(html),
  };
}

/**
 * Combine listing rows with their detail pages. Rows without a detail page,
 * without a deadline, or whose deadline has passed are dropped. Each result
 * gets its own applyUrl: the event website, unless several events share it,
 * in which case the per-event detail page is used.
 */
export function buildConferenceAlertsResults(
  listings: ConferenceAlertsListing[],
  detailHtmlById: ReadonlyMap<string, string>,
  now: Date,
): ScraperResult[] {
  const today = startOfUtcDay(now);
  const candidates: Array<{ listing: ConferenceAlertsListing; detail: ConferenceAlertsDetail }> = [];

  for (const listing of listings) {
    const detailHtml = detailHtmlById.get(listing.eventId);
    if (!detailHtml) continue;
    const detail = parseConferenceAlertsDetail(detailHtml);
    if (!detail.cfpDeadline || detail.cfpDeadline < today) continue;
    candidates.push({ listing, detail });
  }

  const websiteCounts = new Map<string, number>();
  for (const { detail } of candidates) {
    if (detail.website) websiteCounts.set(detail.website, (websiteCounts.get(detail.website) ?? 0) + 1);
  }

  return candidates.map(({ listing, detail }) => {
    const ownWebsite = detail.website && websiteCounts.get(detail.website) === 1 ? detail.website : undefined;
    return {
      title: detail.title || listing.title,
      organization: detail.organiser || detail.title || listing.title,
      description: detail.description,
      location: detail.location || listing.location || null,
      isRemote: listing.isRemote || detail.isRemote === true,
      eventDate: listing.eventDate,
      cfpDeadline: detail.cfpDeadline,
      format: 'conference',
      industries: [],
      applyUrl: ownWebsite || listing.detailUrl,
      source: SOURCE,
      sourceUrl: listing.detailUrl,
    };
  });
}

export async function scrapeConferenceAlertsUSA(): Promise<ScraperResult[]> {
  console.log('Fetching conferences from conferencealerts.com...');
  try {
    const response = await fetchWithTimeout(LISTING_URL, {
      timeoutMs: LISTING_TIMEOUT_MS,
      headers: { Accept: 'text/html' },
    });
    if (!response.ok) {
      console.log(`conferencealerts.com returned ${response.status}, skipping...`);
      return [];
    }

    const now = new Date();
    const listings = parseConferenceAlertsListing(await response.text(), now);

    const detailHtmlById = new Map<string, string>();
    await mapWithConcurrency(listings, DETAIL_CONCURRENCY, async (listing) => {
      try {
        const detail = await fetchWithTimeout(listing.detailUrl, {
          timeoutMs: DETAIL_TIMEOUT_MS,
          headers: { Accept: 'text/html' },
        });
        if (detail.ok) detailHtmlById.set(listing.eventId, await detail.text());
      } catch {
        // A slow or failing detail page only drops that one event.
      }
    });

    const results = buildConferenceAlertsResults(listings, detailHtmlById, now);
    console.log(
      `conferencealerts.com: ${listings.length} upcoming events, ${detailHtmlById.size} detail pages, ${results.length} with an open abstract deadline`,
    );
    return results;
  } catch (error) {
    console.error('Error scraping conferencealerts.com:', error instanceof Error ? error.message : error);
    return [];
  }
}
