import type { ScraperResult } from './index.js';

/**
 * Sessionize scraper.
 * Note: Sessionize does not expose a public API for browsing open CFPs.
 * Their platform is designed for event organizers, not speaker discovery.
 * This scraper is kept as a stub in case they add a public CFP listing in the future.
 */

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
  console.log('Sessionize: No public CFP API available, skipping.');
  return [];
}
