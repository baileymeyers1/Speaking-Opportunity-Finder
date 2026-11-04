import type { ScraperResult } from './index.js';
import { cleanTitle, normalizeIndustries } from '../services/dataNormalization.js';
import { parseIsoDeadline } from '../lib/deadlines.js';

const API_URL = 'https://api.callingallpapers.com/v1/cfp';

interface CallingAllPapersCFP {
  _rel: { cfp_uri: string };
  name: string;
  dateCfpStart: string;
  dateCfpEnd: string;
  dateEventStart: string;
  dateEventEnd: string;
  uri: string;
  eventUri: string;
  description: string;
  location: string;
  latitude: number;
  longitude: number;
  tags: string[];
  iconUri?: string;
}

interface CallingAllPapersResponse {
  cfps?: CallingAllPapersCFP[];
  _links?: { cfp?: { href: string }[] };
}

function mapToScraperResult(cfp: CallingAllPapersCFP): ScraperResult | null {
  // dateCfpEnd is ISO 8601, usually with the organizer's UTC offset; a bare day is read as Anywhere on Earth.
  const deadline = parseIsoDeadline(cfp.dateCfpEnd);
  if (deadline && deadline.instant < new Date()) return null;

  const applyUrl = cfp.eventUri || cfp.uri || cfp._rel?.cfp_uri;
  if (!applyUrl) return null;

  const isRemote =
    !cfp.location ||
    cfp.location.toLowerCase().includes('online') ||
    cfp.location.toLowerCase().includes('virtual');

  // Map tags to industries
  const industries = normalizeIndustries(cfp.tags);
  if (industries.length === 0) {
    industries.push('technology');
  }

  return {
    title: cleanTitle(cfp.name),
    organization: cfp.name,
    description: cfp.description || `Submit your talk proposal to ${cfp.name}.`,
    location: cfp.location || null,
    isRemote,
    eventDate: cfp.dateEventStart ? new Date(cfp.dateEventStart) : undefined,
    cfpDeadline: deadline?.instant,
    deadlineTimezone: deadline?.zone,
    format: 'conference',
    industries,
    compensationType: undefined,
    compensationDetails: undefined,
    applyUrl,
    source: 'callingallpapers.com',
    sourceUrl: cfp.uri || cfp.eventUri,
  };
}

export async function scrapeCallingAllPapers(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  console.log('Fetching CFPs from callingallpapers.com...');

  try {
    const response = await fetch(API_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error('Failed to fetch CallingAllPapers:', response.status);
      return [];
    }

    const data = (await response.json()) as CallingAllPapersResponse;
    const cfps = data.cfps || [];

    for (const cfp of cfps) {
      const result = mapToScraperResult(cfp);
      if (result) {
        results.push(result);
      }
    }

    console.log(`Found ${results.length} CFPs from callingallpapers.com`);
  } catch (error) {
    console.error('Error fetching CallingAllPapers:', error);
  }

  return results;
}
