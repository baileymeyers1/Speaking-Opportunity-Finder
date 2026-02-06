import type { ScraperResult } from './index.js';
import { config } from '../config/index.js';

interface EventbriteEvent {
  name?: { text?: string };
  url?: string;
  start?: { utc?: string };
  end?: { utc?: string };
  venue?: {
    address?: {
      city?: string;
      region?: string;
      country?: string;
    };
  };
  online_event?: boolean;
}

interface EventbriteResponse {
  events?: EventbriteEvent[];
}

export async function scrapeEventbrite(): Promise<ScraperResult[]> {
  const token = config.scrapers?.eventbriteToken;
  if (!token) return [];

  const results: ScraperResult[] = [];
  const queries = ['call for speakers', 'cfp', 'speaker application'];

  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        q,
        'location.address': 'United States',
        expand: 'venue',
      });

      const response = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) continue;
      const data = (await response.json()) as EventbriteResponse;

      for (const event of data.events || []) {
        const title = event.name?.text?.trim();
        const applyUrl = event.url;
        if (!title || !applyUrl) continue;

        const locationParts = [
          event.venue?.address?.city,
          event.venue?.address?.region,
          event.venue?.address?.country,
        ].filter(Boolean);

        results.push({
          title: `${title} - Call for Speakers`,
          organization: title,
          description: `Eventbrite listing matching speaker/CFP queries.`,
          location: locationParts.length > 0 ? locationParts.join(', ') : null,
          isRemote: event.online_event || false,
          eventDate: event.start?.utc ? new Date(event.start.utc) : undefined,
          cfpDeadline: undefined,
          format: 'conference',
          industries: ['events'],
          compensationType: undefined,
          compensationDetails: undefined,
          applyUrl,
          source: 'eventbrite.com',
          sourceUrl: applyUrl,
        });
      }
    } catch {
      continue;
    }
  }

  return results;
}
