import type { ScraperResult } from './index.js';
import { config } from '../config/index.js';

interface EventbriteEvent {
  name?: { text?: string };
  url?: string;
  description?: { text?: string };
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

function extractDeadline(content: string): Date | undefined {
  const patterns = [
    /(?:deadline|submit by|closes?|due|cfp ends?)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i,
    /(?:deadline|submit by|closes?|due|cfp ends?)[:\s]*(\d{4}-\d{2}-\d{2})/i,
    /(?:deadline|submit by|closes?|due|cfp ends?)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime()) && parsed > new Date()) {
        return parsed;
      }
    }
  }

  return undefined;
}

function extractCompensation(content: string) {
  const lower = content.toLowerCase();
  let compensationType: string | undefined;

  if (/\bhonorarium\b/.test(lower)) compensationType = 'honorarium';
  else if (/\bpaid\b/.test(lower)) compensationType = 'paid';
  else if (/\btravel\b/.test(lower)) compensationType = 'travel';
  else if (/\bstipend\b/.test(lower)) compensationType = 'paid';
  else if (/\bexposure\b/.test(lower)) compensationType = 'exposure';

  const amountMatch = content.match(/\$[\s]*([0-9]{2,6}(?:,[0-9]{3})?)/);
  const compensationAmount = amountMatch
    ? parseInt(amountMatch[1].replace(/,/g, ''), 10)
    : undefined;

  return { compensationType, compensationAmount };
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

        const description = event.description?.text || '';
        const cfpDeadline = description ? extractDeadline(description) : undefined;
        const compensation = description ? extractCompensation(description) : {};

        const locationParts = [
          event.venue?.address?.city,
          event.venue?.address?.region,
          event.venue?.address?.country,
        ].filter(Boolean);

        results.push({
          title: `${title} - Call for Speakers`,
          organization: title,
          description: description
            ? description.substring(0, 500)
            : `Eventbrite listing matching speaker/CFP queries.`,
          location: locationParts.length > 0 ? locationParts.join(', ') : null,
          isRemote: event.online_event || false,
          eventDate: event.start?.utc ? new Date(event.start.utc) : undefined,
          cfpDeadline,
          format: 'conference',
          industries: ['events'],
          compensationType: compensation.compensationType,
          compensationAmount: compensation.compensationAmount,
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
