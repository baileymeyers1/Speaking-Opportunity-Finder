import type { ScraperResult } from './qualityScore.js';
import { normalizeIndustries } from '../services/dataNormalization.js';
import { fetchWithTimeout, startOfUtcDay } from './lib/html.js';

/**
 * developers.events publishes its whole dataset as JSON. all-events.json holds
 * every conference, with an embedded `cfp` object for those that run a call
 * for speakers. all-cfps.json is the same CFP data nested under `conf` but
 * without tags/city/country, so only all-events.json is fetched.
 *
 * Live shape (verified): { name, date: [startMs, endMs?], hyperlink, location,
 * city, country, status, tags: [{ key, value }], cfp: { link, until, untilDate } | {} }
 */

const EVENTS_URL = 'https://developers.events/all-events.json';
const SOURCE = 'developers.events';
const FETCH_TIMEOUT_MS = 30_000;

interface DevelopersEventTag {
  key?: string;
  value?: string;
}

interface DevelopersEventCfp {
  link?: string;
  until?: string;
  untilDate?: number | null;
  durations?: string[];
}

interface DevelopersEvent {
  name?: string;
  date?: number[];
  hyperlink?: string;
  location?: string;
  city?: string;
  country?: string;
  status?: string;
  tags?: DevelopersEventTag[];
  cfp?: DevelopersEventCfp | null;
}

function isAbsoluteHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function describeDurations(durations: string[] | undefined): string | undefined {
  const formats = (durations ?? [])
    .map((entry) => entry.match(/^([a-z-]+):(\d+)$/i))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => `${match[1]} (${match[2]} min)`);
  return formats.length > 0 ? `Session formats: ${formats.join(', ')}.` : undefined;
}

function industriesFromTags(tags: DevelopersEventTag[] | undefined): string[] {
  const values = (tags ?? [])
    .filter((tag) => tag.key === 'topic' || tag.key === 'tech')
    .map((tag) => tag.value ?? '');
  const industries = normalizeIndustries(values);
  return industries.length > 0 ? industries : ['technology'];
}

/**
 * Map all-events.json to open calls for speakers: a CFP link and a CFP close
 * date that has not passed (the close day itself still counts), for events
 * that have not ended and were not cancelled. One result per CFP link, keeping
 * the earliest-closing event when a link is shared (e.g. one CFP form for a
 * multi-city series).
 */
export function parseDevelopersEvents(data: unknown, now: Date): ScraperResult[] {
  if (!Array.isArray(data)) return [];
  const today = startOfUtcDay(now).getTime();

  const open: Array<{ event: DevelopersEvent; name: string; link: string; closesAt: number }> = [];
  for (const event of data as DevelopersEvent[]) {
    const name = event.name?.trim();
    const cfp = event.cfp;
    if (!name || !cfp || !isAbsoluteHttpUrl(cfp.link)) continue;
    // untilDate is UTC midnight of the closing day; that day still counts as open.
    if (typeof cfp.untilDate !== 'number' || cfp.untilDate < today) continue;
    if (event.status && !['open', 'virtualized'].includes(event.status.toLowerCase())) continue;
    const lastDay = event.date?.[event.date.length - 1];
    if (typeof lastDay === 'number' && lastDay < today) continue;
    open.push({ event, name, link: cfp.link, closesAt: cfp.untilDate });
  }
  open.sort((left, right) => left.closesAt - right.closesAt);

  const results: ScraperResult[] = [];
  const seenLinks = new Set<string>();

  for (const { event, name, link, closesAt } of open) {
    if (seenLinks.has(link)) continue;
    seenLinks.add(link);

    const rawLocation = event.location?.trim();
    const isOnlineOnly = !rawLocation || /^online$/i.test(rawLocation);
    const startMs = event.date?.[0];

    results.push({
      title: name,
      organization: name,
      description: describeDurations(event.cfp?.durations),
      location: isOnlineOnly ? null : rawLocation,
      isRemote:
        isOnlineOnly || /online/i.test(rawLocation ?? '') || event.status?.toLowerCase() === 'virtualized',
      eventDate: typeof startMs === 'number' ? new Date(startMs) : undefined,
      cfpDeadline: new Date(closesAt),
      format: 'conference',
      industries: industriesFromTags(event.tags),
      applyUrl: link,
      source: SOURCE,
      sourceUrl: isAbsoluteHttpUrl(event.hyperlink) ? event.hyperlink : link,
    });
  }

  return results;
}

export async function scrapeDevelopersEvents(): Promise<ScraperResult[]> {
  console.log('Fetching events from developers.events...');
  try {
    const response = await fetchWithTimeout(EVENTS_URL, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.log(`developers.events returned ${response.status}, skipping...`);
      return [];
    }
    const data: unknown = await response.json();
    const results = parseDevelopersEvents(data, new Date());
    console.log(
      `developers.events: ${Array.isArray(data) ? data.length : 0} events, ${results.length} open calls for speakers`,
    );
    return results;
  } catch (error) {
    console.error('Error scraping developers.events:', error instanceof Error ? error.message : error);
    return [];
  }
}
