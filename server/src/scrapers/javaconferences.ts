import type { ScraperResult } from './index.js';

const JAVA_CONFERENCES_URL = 'https://javaconferences.org/conferences.json';

interface JavaConference {
  name: string;
  link: string;
  locationName: string;
  coordinates?: {
    lat: number;
    lng: number;
    country: string;
  };
  hybrid?: boolean;
  date: string;
  cfpLink?: string;
  cfpEndDate?: string;
}

function parseDate(dateStr: string): Date | undefined {
  // Handle formats like "2-4 February 2026", "22-27 January 2026"
  try {
    // Extract the year and month from the string
    const parts = dateStr.split(' ');
    if (parts.length >= 2) {
      const year = parts[parts.length - 1];
      const month = parts[parts.length - 2];
      const dayPart = parts[0].split('-')[0]; // Get first day if range

      const dateString = `${dayPart} ${month} ${year}`;
      const parsed = new Date(dateString);

      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  } catch {
    // Fall through to undefined
  }
  return undefined;
}

function parseCfpDeadline(dateStr: string): Date | undefined {
  // Handle formats like "30 September 2025", "11 November 2025"
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // Fall through
  }
  return undefined;
}

function mapToScraperResult(conf: JavaConference): ScraperResult | null {
  // Only include conferences with open CFPs
  if (!conf.cfpLink) {
    return null;
  }

  // Skip if CFP has already ended
  if (conf.cfpEndDate) {
    const cfpEnd = parseCfpDeadline(conf.cfpEndDate);
    if (cfpEnd && cfpEnd < new Date()) {
      return null;
    }
  }

  const isRemote = conf.locationName?.toLowerCase() === 'online' || conf.hybrid === true;
  const location = conf.locationName?.toLowerCase() === 'online' ? null : conf.locationName;

  return {
    title: `${conf.name} - Call for Speakers`,
    organization: conf.name,
    description: `Submit your talk proposal to ${conf.name}. ${isRemote && !location ? 'This is an online event.' : location ? `Taking place in ${location}.` : ''} ${conf.hybrid ? 'Hybrid event with online option available.' : ''}`.trim(),
    location: location || null,
    isRemote,
    eventDate: parseDate(conf.date),
    cfpDeadline: conf.cfpEndDate ? parseCfpDeadline(conf.cfpEndDate) : undefined,
    format: 'conference',
    industries: ['technology', 'java', 'software development'],
    compensationType: undefined,
    compensationDetails: undefined,
    applyUrl: conf.cfpLink,
    source: 'javaconferences.org',
    sourceUrl: conf.link,
  };
}

export async function scrapeJavaConferences(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  console.log('Fetching conferences from javaconferences.org...');

  try {
    const response = await fetch(JAVA_CONFERENCES_URL);
    if (!response.ok) {
      console.error('Failed to fetch Java conferences:', response.status);
      return [];
    }

    const conferences = (await response.json()) as JavaConference[];

    for (const conf of conferences) {
      const result = mapToScraperResult(conf);
      if (result) {
        results.push(result);
      }
    }

    console.log(`Found ${results.length} Java conferences with open CFPs`);
  } catch (error) {
    console.error('Error fetching Java conferences:', error);
  }

  return results;
}
