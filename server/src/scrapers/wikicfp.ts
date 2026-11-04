import type { ScraperResult } from './qualityScore.js';
import { cleanTitle, decodeHtmlEntities, normalizeIndustries } from '../services/dataNormalization.js';
import {
  fetchWithTimeout,
  mapWithConcurrency,
  parseHumanDate,
  startOfUtcDay,
  stripTags,
} from './lib/html.js';
import { endOfCalendarDay } from '../lib/deadlines.js';

/**
 * WikiCFP category RSS feeds (20 most recent CFPs per category). These are
 * academic calls for papers, not calls for speakers.
 *
 * Each item description is "<full name> [<location>] [<Mon D, YYYY> - <Mon D, YYYY>]",
 * i.e. the feed carries the event dates and location but NOT the submission
 * deadline. The deadline is read from each event's detail page, which marks it
 * up with schema attributes (property="v:summary" content="Submission Deadline").
 */

const SOURCE = 'wikicfp.com';
const FEED_TIMEOUT_MS = 15_000;
const DETAIL_TIMEOUT_MS = 10_000;
const DETAIL_CONCURRENCY = 3;

const WIKICFP_FEEDS = [
  { url: 'http://www.wikicfp.com/cfp/rss?cat=computer+science', industries: ['technology', 'computer science'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=artificial+intelligence', industries: ['technology', 'AI', 'machine learning'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=data+science', industries: ['technology', 'data science'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=security', industries: ['technology', 'cybersecurity'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=engineering', industries: ['engineering'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=education', industries: ['education'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=healthcare', industries: ['healthcare'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=business', industries: ['business'] },
];

/** Journals, special issues and book chapters are not events anyone speaks at. */
const NON_EVENT_PATTERN = /\b(journal|special (?:issue|section)|call for chapters|book chapters?)\b/i;

const DATE_RANGE = '([A-Z][a-z]{2,8}\\.? \\d{1,2}, \\d{4})\\s*-\\s*([A-Z][a-z]{2,8}\\.? \\d{1,2}, \\d{4})';
const DESCRIPTION_PATTERN = new RegExp(`^([\\s\\S]*?)\\s*(?:\\[([^\\]]*)\\]\\s*)?\\[${DATE_RANGE}\\]\\s*$`);

const DEADLINE_LABELS = ['Submission Deadline', 'Abstract Registration Due'];

function readTag(itemXml: string, tag: string): string {
  const match = itemXml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return match ? decodeHtmlEntities(match[1].trim()) : '';
}

/**
 * Parse one WikiCFP RSS feed into results with event date, location and
 * remote flag from the feed. cfpDeadline is filled later from the detail page.
 * Items that are journals/chapters, lack a date range, or have already ended
 * are dropped.
 */
export function parseWikiCfpFeed(xml: string, industries: string[], now: Date): ScraperResult[] {
  const today = startOfUtcDay(now);
  const results: ScraperResult[] = [];

  for (const [, itemXml] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const rawTitle = readTag(itemXml, 'title');
    const link = readTag(itemXml, 'link');
    const description = stripTags(readTag(itemXml, 'description'));
    if (!rawTitle || !/^https?:\/\//.test(link)) continue;
    if (NON_EVENT_PATTERN.test(rawTitle) || NON_EVENT_PATTERN.test(description)) continue;

    const parts = description.match(DESCRIPTION_PATTERN);
    if (!parts) continue;
    const [, fullName, place, startText, endText] = parts;
    const eventDate = parseHumanDate(startText);
    const eventEnd = parseHumanDate(endText) ?? eventDate;
    if (!eventDate || !eventEnd || eventEnd < today) continue;

    const placeText = place?.trim() ?? '';
    const isRemote = /\b(online|virtual)\b/i.test(placeText);
    const hasPlace = placeText !== '' && !/^(n\/?a|tba|tbd)$/i.test(placeText) && !/^(full )?(online|virtual)$/i.test(placeText);
    const title = cleanTitle(rawTitle);
    const name = fullName.trim() || title;

    results.push({
      title,
      organization: name,
      description: name,
      location: hasPlace ? placeText : null,
      isRemote,
      eventDate,
      cfpDeadline: undefined,
      format: 'conference',
      industries: normalizeIndustries(industries),
      applyUrl: link,
      source: SOURCE,
      sourceUrl: link,
    });
  }

  return results;
}

/** Read the submission (or abstract) deadline from a WikiCFP event detail page. */
export function parseWikiCfpDeadline(html: string): Date | undefined {
  const deadlines = new Map<string, Date>();
  const pattern = /property="v:summary"\s+content="([^"]+)"[\s\S]*?property="v:startDate"\s+content="([^"]+)"/g;
  for (const [, label, value] of html.matchAll(pattern)) {
    const date = parseHumanDate(value);
    if (date && !deadlines.has(label)) deadlines.set(label, date);
  }
  for (const label of DEADLINE_LABELS) {
    const date = deadlines.get(label);
    if (date) return date;
  }
  return undefined;
}

export async function scrapeWikiCFP(): Promise<ScraperResult[]> {
  console.log('Fetching CFPs from WikiCFP...');
  const now = new Date();
  const today = startOfUtcDay(now);
  const byLink = new Map<string, ScraperResult>();

  for (const feed of WIKICFP_FEEDS) {
    try {
      const response = await fetchWithTimeout(feed.url, {
        timeoutMs: FEED_TIMEOUT_MS,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      });
      if (!response.ok) {
        console.log(`WikiCFP feed ${feed.url} returned ${response.status}, skipping...`);
        continue;
      }
      for (const result of parseWikiCfpFeed(await response.text(), feed.industries, now)) {
        if (!byLink.has(result.applyUrl)) byLink.set(result.applyUrl, result);
      }
    } catch (error) {
      console.error(`Error fetching WikiCFP feed ${feed.url}:`, error instanceof Error ? error.message : error);
    }
  }

  const candidates = [...byLink.values()];
  const deadlines = await mapWithConcurrency(candidates, DETAIL_CONCURRENCY, async (result) => {
    try {
      const response = await fetchWithTimeout(result.applyUrl, {
        timeoutMs: DETAIL_TIMEOUT_MS,
        headers: { Accept: 'text/html' },
      });
      return response.ok ? parseWikiCfpDeadline(await response.text()) : undefined;
    } catch {
      return undefined;
    }
  });

  // Keep items whose deadline is still open; if the detail page could not be
  // read, keep the item (its event is upcoming) without a deadline.
  const results = candidates
    // WikiCFP states a day with no zone: read as Anywhere on Earth.
    .map((result, index) => ({ ...result, cfpDeadline: endOfCalendarDay(deadlines[index]) }))
    .filter((result) => !result.cfpDeadline || result.cfpDeadline >= today);

  const withDeadline = results.filter((result) => result.cfpDeadline).length;
  console.log(
    `Found ${results.length} CFPs from WikiCFP (${candidates.length} upcoming, ${withDeadline} with an open deadline)`,
  );
  return results;
}
