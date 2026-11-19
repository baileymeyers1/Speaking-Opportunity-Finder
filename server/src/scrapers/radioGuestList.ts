import type { ScraperResult } from './qualityScore.js';
import { decodeHtmlEntities } from '../services/dataNormalization.js';
import { fetchWithTimeout, htmlToLines, stripTags } from './lib/html.js';

/**
 * RadioGuestList.com posts "guest requests": a podcast, radio or video show
 * tells the site what kind of guest it is looking for, and the site publishes
 * the request with the show's description, formats and how to pitch it. The
 * requests are public as a blog and as its RSS feed (the 20 newest, about one
 * new request a day; verified 2026-11-18, robots.txt allows /guestrequests).
 *
 * A request has no deadline: a show books guests until it stops asking. The
 * site takes old requests down (its sitemap held five weeks of them), and
 * verification closes the row when its page is gone. The row links to the request page itself,
 * which holds the show's booking contact; that contact is not copied here.
 */

export const RADIO_GUEST_LIST_FEED_URL = 'https://radioguestlist.com/guestrequests?format=rss';
const SOURCE = 'radioguestlist.com';
const FEED_TIMEOUT_MS = 15_000;
const DESCRIPTION_MAX_CHARS = 2000;
const MAX_INDUSTRIES = 5;

export interface GuestRequest {
  /** The request page on radioguestlist.com. */
  url: string;
  showName: string;
  /** Who the show is looking for, from the post title: "Seasoned Digital Marketers". */
  seeking: string;
  categories: string[];
  /** The one-line pitch: "Is seeking seasoned digital marketers to …". */
  summary?: string;
  showDescription?: string;
  /** What the show wants from a guest, when it says more than the summary. */
  guestRequest?: string;
  /** "Recorded podcast", "Video webcast", "Broadcast radio show", … */
  showFormats: string[];
  /** The show's answer to "do you charge guests, and what do they get back". */
  guestFees?: string;
  /** The show's own site. */
  website?: string;
}

type FieldKey =
  | 'showName' | 'showDescription' | 'guestRequest' | 'hosts' | 'bookingContact' | 'bookingForm' | 'bookingEmail'
  | 'audience' | 'showFormat' | 'airs' | 'episodes' | 'website' | 'showUrl' | 'social' | 'guestFees' | 'unknown';

/**
 * The labels of the site's request form, each matched with its trailing
 * colon, question mark and required-field asterisk so that what is left of
 * the line is the answer (some answers share the label's line).
 */
const FIELD_LABELS: ReadonlyArray<readonly [FieldKey, RegExp]> = [
  ['showName', /^Show Name\s*:?\s*\*?\s*/i],
  ['showDescription', /^Show Description\s*:?\s*\*?\s*/i],
  ['guestRequest', /^Guest Request\s*:?\s*\*?\s*/i],
  ['hosts', /^Show Host Names?(?:\(s\))?\s*:?\s*\*?\s*/i],
  ['bookingContact', /^Booking Contact[^:]*:?\s*\*?\s*/i],
  ['bookingForm', /^Booking Form URL\s*:?\s*\*?\s*/i],
  ['bookingEmail', /^Booking Email[^:]*:?\s*\*?\s*/i],
  ['audience', /^Audience Size[^:]*:?\s*\*?\s*/i],
  ['showFormat', /^Show Format\s*:?\s*\*?\s*/i],
  ['airs', /^When, where,? and how does your show air\??\s*(?:\(share details.*?:)?\s*\*?\s*/i],
  ['airs', /^\(share details.*?:\s*\*?\s*/i],
  ['episodes', /^How many episodes[^?]*\??\s*\*?\s*/i],
  ['website', /^Website URL\s*:?\s*\*?\s*/i],
  ['showUrl', /^Show URL\s*:?\s*\*?\s*/i],
  ['social', /^Social Media\s*:?\s*\*?\s*/i],
  ['guestFees', /^We do not encourage this[^?]*\??\s*\*?\s*/i],
];

/** Squarespace leaves zero-width joiners and non-breaking spaces around labels. */
function tidy(text: string): string {
  return text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
}

function readTag(itemXml: string, tag: string): string {
  const match = itemXml.match(new RegExp(`<${tag}\\b[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return match ? match[1].trim() : '';
}

function readTags(itemXml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'g');
  return [...itemXml.matchAll(pattern)].map((match) => tidy(decodeHtmlEntities(match[1]))).filter(Boolean);
}

/**
 * Split a request's body into the answers of the site's form. A line that
 * starts with a known label opens that field; a line ending in the form's
 * required-field asterisk is a label this parser does not know and opens a
 * field that is ignored, so its answer never runs into the one before it.
 */
export function parseGuestRequestFields(contentHtml: string): Partial<Record<FieldKey, string[]>> & { intro: string[] } {
  const fields: Partial<Record<FieldKey, string[]>> & { intro: string[] } = { intro: [] };
  let current: string[] = fields.intro;

  for (const rawLine of htmlToLines(contentHtml)) {
    const line = tidy(rawLine);
    if (!line) continue;
    const label = FIELD_LABELS.find(([, pattern]) => pattern.test(line));
    if (label) {
      const [key, pattern] = label;
      current = fields[key] ?? (fields[key] = []);
      const rest = tidy(line.replace(pattern, ''));
      if (rest) current.push(rest);
    } else if (/\*$/.test(line)) {
      current = fields.unknown ?? (fields.unknown = []);
    } else {
      current.push(line);
    }
  }

  return fields;
}

const TITLE_PATTERN = /^(?:#\s*\d+\s*:?\s*)?(.+?)\s+seeks\s+(.+)$/i;
const NOT_A_REQUEST = new Set(['sponsored post', 'featured guest experts']);

function firstUrl(lines: string[] | undefined): string | undefined {
  return lines?.join(' ').match(/https?:\/\/[^\s"'<>]+/i)?.[0];
}

function joined(lines: string[] | undefined): string | undefined {
  const text = lines?.join(' ').trim();
  return text || undefined;
}

/**
 * The guest requests in the feed, newest first. The site also posts sponsored
 * "featured guest expert" profiles in the same feed; those have no
 * "<show> seeks <guests>" title and are skipped.
 */
export function parseGuestRequestFeed(xml: string): GuestRequest[] {
  const requests: GuestRequest[] = [];

  for (const [, itemXml] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = tidy(decodeHtmlEntities(readTag(itemXml, 'title')));
    const url = decodeHtmlEntities(readTag(itemXml, 'link'));
    const categories = readTags(itemXml, 'category');
    const titleParts = title.match(TITLE_PATTERN);
    if (!titleParts || !/^https?:\/\//.test(url)) continue;
    if (categories.some((category) => NOT_A_REQUEST.has(category.toLowerCase()))) continue;

    const fields = parseGuestRequestFields(readTag(itemXml, 'content:encoded'));
    const summary = tidy(stripTags(readTag(itemXml, 'description'))) || joined(fields.intro);

    requests.push({
      url,
      // The form's "Show Name" keeps punctuation the post title drops ("It's Your Break").
      showName: joined(fields.showName) ?? titleParts[1],
      seeking: titleParts[2],
      categories,
      summary: summary || undefined,
      showDescription: joined(fields.showDescription),
      guestRequest: joined(fields.guestRequest),
      showFormats: fields.showFormat ?? [],
      guestFees: joined(fields.guestFees),
      website: firstUrl(fields.website) ?? firstUrl(fields.showUrl),
    });
  }

  return requests;
}

/**
 * A show that names a price for the interview is selling airtime, which is
 * not a speaking opportunity ("No charge", "No fees" and requests for
 * cross-promotion are fine).
 */
export function chargesGuests(request: GuestRequest): boolean {
  return /[$€£]\s?\d/.test(request.guestFees ?? '');
}

const BROADCAST_ONLY_FORMAT = /\b(broadcast|satellite|terrestrial)\b.*\bradio\b|\btelevision\b|\btv\b/i;

/**
 * A guest spot is a podcast appearance unless every format the show lists is
 * broadcast: a show that only airs on terrestrial or satellite radio or on
 * television is labelled "other".
 */
export function inferGuestRequestFormat(request: GuestRequest): 'podcast' | 'other' {
  if (request.showFormats.length === 0) return 'podcast';
  return request.showFormats.every((format) => BROADCAST_ONLY_FORMAT.test(format)) ? 'other' : 'podcast';
}

/** Categories that describe the show's medium or the post, not its subject. */
const NON_TOPIC_CATEGORY = /^(general interest|recorded podcast|video (?:webcast|livestream)|.*\bradio\b.*|uk-based|other)$/i;
const TOPIC_ALIASES: Readonly<Record<string, string | null>> = {
  web: null,
  authors: null,
  tech: 'technology',
  movies: 'film',
  tv: 'television',
  christian: 'religion',
  'video games': 'gaming',
  'womens issues': "women's issues",
};

/**
 * The site files each request under categories such as "Health & Wellness
 * Podcasts" or "Web/Tech Shows"; the subjects in them become industry tags.
 */
export function industriesFromCategories(categories: readonly string[]): string[] {
  const tags: string[] = [];
  for (const category of categories) {
    const subject = category.replace(/\s+(podcasts?|shows?)$/i, '').trim();
    // The site also uses one-letter categories ("h", "x") for its own bookkeeping.
    if (subject.length < 2 || NON_TOPIC_CATEGORY.test(category) || NON_TOPIC_CATEGORY.test(subject)) continue;
    for (const part of subject.split(/\s*(?:&|\/|\band\b)\s*/i)) {
      const lower = part.trim().toLowerCase();
      const tag = lower in TOPIC_ALIASES ? TOPIC_ALIASES[lower] : lower;
      if (tag && !tags.includes(tag)) tags.push(tag);
    }
  }
  return tags.slice(0, MAX_INDUSTRIES);
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function describe(request: GuestRequest): string {
  const summary = request.summary
    ? /^is seeking\b/i.test(request.summary)
      ? `${request.showName} is ${request.summary.slice(3)}`
      : request.summary
    : `${request.showName} is seeking ${request.seeking}.`;
  const parts = [summary];
  if (request.guestRequest) parts.push(request.guestRequest);
  if (request.showDescription) parts.push(`About the show: ${request.showDescription}`);
  // How to reach the show is on the request page; addresses do not belong in a listing.
  return parts
    .join(' ')
    .replace(EMAIL_PATTERN, 'the address on the request page')
    .replace(/\s+/g, ' ')
    .slice(0, DESCRIPTION_MAX_CHARS)
    .trim();
}

/** Map guest requests to opportunities, leaving out shows that charge their guests. */
export function buildGuestRequestResults(requests: readonly GuestRequest[]): ScraperResult[] {
  const results: ScraperResult[] = [];
  for (const request of requests) {
    if (chargesGuests(request)) continue;
    results.push({
      title: `${request.showName} seeks ${request.seeking}`,
      organization: request.showName,
      description: describe(request),
      location: null,
      // The shows on this list book guests from anywhere and record over a call.
      isRemote: true,
      format: inferGuestRequestFormat(request),
      industries: industriesFromCategories(request.categories),
      // A guest interview is publicity, not a paid engagement.
      compensationType: 'exposure',
      compensationDetails: request.guestFees
        ? `Unpaid guest interview. The show on guest fees: ${request.guestFees}`.slice(0, 300)
        : 'Unpaid guest interview.',
      applyUrl: request.url,
      source: SOURCE,
      sourceUrl: request.website ?? request.url,
    });
  }
  return results;
}

export async function scrapeRadioGuestList(): Promise<ScraperResult[]> {
  console.log('Fetching guest requests from radioguestlist.com...');
  try {
    const response = await fetchWithTimeout(RADIO_GUEST_LIST_FEED_URL, {
      timeoutMs: FEED_TIMEOUT_MS,
      headers: { Accept: 'application/rss+xml,application/xml,text/xml' },
    });
    if (!response.ok) {
      console.log(`radioguestlist.com feed returned ${response.status}, skipping...`);
      return [];
    }
    const requests = parseGuestRequestFeed(await response.text());
    const results = buildGuestRequestResults(requests);
    console.log(
      `radioguestlist.com: ${requests.length} guest requests in the feed, ${requests.length - results.length} charge guests, ${results.length} kept`,
    );
    return results;
  } catch (error) {
    console.error('Error scraping radioguestlist.com:', error instanceof Error ? error.message : error);
    return [];
  }
}
