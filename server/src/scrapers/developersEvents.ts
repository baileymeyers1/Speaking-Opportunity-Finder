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

  const events = await fetchJson<DeveloperEvent[]>('https://developers.events/all-events.json');
  const cfps = await fetchJson<DeveloperEvent[]>('https://developers.events/all-cfps.json');

  if (!events && !cfps) return results;

  const combined = [...(events || []), ...(cfps || [])];
  const seen = new Set<string>();

  for (const event of combined) {
    const name = event.name?.trim();
    if (!name) continue;

    const applyUrl = event.cfpUrl || event.url;
    if (!applyUrl || seen.has(applyUrl)) continue;
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

  return results;
}
