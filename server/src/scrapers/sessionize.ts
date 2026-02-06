import type { ScraperResult } from './index.js';

/**
 * Scrapes Sessionize's public API for open CFPs.
 * Sessionize provides a JSON endpoint for events accepting submissions.
 */

const SESSIONIZE_API_URL = 'https://sessionize.com/api/v2/cfps';

interface SessionizeEvent {
  id: number;
  name: string;
  description?: string;
  url: string;
  website?: string;
  cfpUrl?: string;
  cfpStartDate?: string;
  cfpEndDate?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  location?: {
    name?: string;
    city?: string;
    country?: string;
  };
  isOnline?: boolean;
  categories?: string[];
  tags?: string[];
}

function mapToScraperResult(event: SessionizeEvent): ScraperResult | null {
  // Skip if CFP deadline has passed
  if (event.cfpEndDate) {
    const deadline = new Date(event.cfpEndDate);
    if (deadline < new Date()) {
      return null;
    }
  }

  const applyUrl = event.cfpUrl || event.url || event.website;
  if (!applyUrl) return null;

  const locationParts = [];
  if (event.location?.city) locationParts.push(event.location.city);
  if (event.location?.country) locationParts.push(event.location.country);
  const location = locationParts.length > 0 ? locationParts.join(', ') : null;

  const industries: string[] = ['technology'];
  if (event.tags) {
    industries.push(...event.tags.filter((t) => t && !industries.includes(t.toLowerCase())).slice(0, 4));
  }
  if (event.categories) {
    industries.push(...event.categories.filter((c) => c && !industries.includes(c.toLowerCase())).slice(0, 3));
  }

  return {
    title: `${event.name} - Call for Speakers`,
    organization: event.name,
    description: event.description || `Submit your talk proposal to ${event.name}.`,
    location,
    isRemote: event.isOnline || false,
    eventDate: event.eventStartDate ? new Date(event.eventStartDate) : undefined,
    cfpDeadline: event.cfpEndDate ? new Date(event.cfpEndDate) : undefined,
    format: 'conference',
    industries,
    compensationType: undefined,
    compensationDetails: undefined,
    applyUrl,
    source: 'sessionize.com',
    sourceUrl: event.website || event.url,
  };
}

export async function scrapeSessionize(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  console.log('Fetching CFPs from Sessionize...');

  try {
    const response = await fetch(SESSIONIZE_API_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SpeakingOpportunityFinder/1.0',
      },
    });

    if (!response.ok) {
      // Sessionize may not have a public JSON API - fall back gracefully
      console.log(`Sessionize API returned ${response.status}, skipping...`);
      return [];
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      console.log('Sessionize did not return JSON, skipping...');
      return [];
    }

    const events = (await response.json()) as SessionizeEvent[];

    if (!Array.isArray(events)) {
      console.log('Sessionize response was not an array, skipping...');
      return [];
    }

    for (const event of events) {
      const result = mapToScraperResult(event);
      if (result) {
        const exists = results.some((r) => r.applyUrl === result.applyUrl);
        if (!exists) {
          results.push(result);
        }
      }
    }

    console.log(`Found ${results.length} CFPs from Sessionize`);
  } catch (error) {
    console.error('Error fetching Sessionize:', error);
  }

  return results;
}
