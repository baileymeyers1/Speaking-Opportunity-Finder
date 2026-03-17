import type { ScraperResult } from './index.js';
import { cleanTitle, normalizeIndustries } from '../services/dataNormalization.js';

/**
 * Scrapes PaperCall's public events API for open CFPs.
 * PaperCall provides a JSON API for publicly listed events.
 */

const PAPERCALL_API_URL = 'https://www.papercall.io/events.json';

interface PaperCallEvent {
  id: number;
  name: string;
  description?: string;
  website?: string;
  cfp_url?: string;
  cfp_open?: boolean;
  cfp_start?: string;
  cfp_end?: string;
  event_start?: string;
  event_end?: string;
  location?: string;
  city?: string;
  country?: string;
  online?: boolean;
  tags?: string[];
}

function mapToScraperResult(event: PaperCallEvent): ScraperResult | null {
  // Only include events with open CFPs
  if (event.cfp_open === false) {
    return null;
  }

  // Skip if CFP deadline has passed
  if (event.cfp_end) {
    const deadline = new Date(event.cfp_end);
    if (deadline < new Date()) {
      return null;
    }
  }

  const applyUrl = event.cfp_url || event.website || `https://www.papercall.io/cfps/${event.id}`;
  const locationStr = event.location || (event.city && event.country ? `${event.city}, ${event.country}` : event.country) || null;

  const industries = normalizeIndustries(event.tags);
  if (industries.length === 0) {
    industries.push('technology');
  }

  return {
    title: cleanTitle(event.name),
    organization: event.name,
    description: event.description || `Submit your talk proposal to ${event.name}.`,
    location: locationStr,
    isRemote: event.online || false,
    eventDate: event.event_start ? new Date(event.event_start) : undefined,
    cfpDeadline: event.cfp_end ? new Date(event.cfp_end) : undefined,
    format: 'conference',
    industries,
    compensationType: undefined,
    compensationDetails: undefined,
    applyUrl,
    source: 'papercall.io',
    sourceUrl: event.website || `https://www.papercall.io/cfps/${event.id}`,
  };
}

export async function scrapePaperCall(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  console.log('Fetching CFPs from PaperCall...');

  try {
    const response = await fetch(PAPERCALL_API_URL, {
      headers: {
        Accept: 'application/json, text/html, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; SpeakingOpportunityFinder/1.0)',
      },
    });

    if (!response.ok) {
      console.log(`PaperCall API returned ${response.status} (${response.statusText}), skipping...`);
      return [];
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      console.log('PaperCall did not return JSON, skipping...');
      return [];
    }

    const events = (await response.json()) as PaperCallEvent[];

    if (!Array.isArray(events)) {
      console.log('PaperCall response was not an array, skipping...');
      return [];
    }

    for (const event of events) {
      const result = mapToScraperResult(event);
      if (result) {
        results.push(result);
      }
    }

    console.log(`Found ${results.length} CFPs from PaperCall`);
  } catch (error) {
    console.error('Error fetching PaperCall:', error);
  }

  return results;
}
