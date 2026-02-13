import type { ScraperResult } from './index.js';

interface DeveloperEvent {
  name?: string;
  url?: string;
  cfpUrl?: string;
  city?: string;
  country?: string;
  online?: boolean;
  startDate?: string;
  endDate?: string;
  cfpEndDate?: string;
  cfpStartDate?: string;
  tags?: string[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function toDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export async function scrapeDevelopersEvents(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  console.log('Fetching events from developers.events...');
  const events = await fetchJson<DeveloperEvent[]>('https://developers.events/all-events.json');
  const cfps = await fetchJson<DeveloperEvent[]>('https://developers.events/all-cfps.json');
  console.log(`developers.events: ${events?.length || 0} events, ${cfps?.length || 0} CFPs fetched`);

  if (!events && !cfps) return results;

  const combined = [...(events || []), ...(cfps || [])];
  const seen = new Set<string>();

  for (const event of combined) {
    const name = event.name?.trim();
    if (!name) continue;

    const applyUrl = event.cfpUrl || event.url;
    if (!applyUrl || seen.has(applyUrl)) continue;

    // Skip events with past CFP deadlines or past event dates
    const now = new Date();
    const cfpEnd = toDate(event.cfpEndDate);
    const eventStart = toDate(event.startDate);
    if (cfpEnd && cfpEnd < now) continue;
    if (!cfpEnd && eventStart && eventStart < now) continue;

    seen.add(applyUrl);

    const location =
      event.city && event.country ? `${event.city}, ${event.country}` : event.country || null;

    const industries = event.tags && event.tags.length > 0 ? event.tags.slice(0, 5) : ['technology'];

    results.push({
      title: `${name} - Call for Speakers`,
      organization: name,
      description: `Developer conference listed on developers.events.`,
      location,
      isRemote: event.online || false,
      eventDate: toDate(event.startDate),
      cfpDeadline: toDate(event.cfpEndDate),
      format: 'conference',
      industries,
      compensationType: undefined,
      compensationDetails: undefined,
      applyUrl,
      source: 'developers.events',
      sourceUrl: event.url || applyUrl,
    });
  }

  console.log(`Found ${results.length} current events from developers.events`);
  return results;
}
