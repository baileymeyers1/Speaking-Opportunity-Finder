import type { ScraperResult } from './index.js';
import { cleanTitle, normalizeIndustries } from '../services/dataNormalization.js';

const CONFS_TECH_BASE_URL =
  'https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences';

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

// Topics/categories available in confs.tech
const TOPICS = [
  'android',
  'clojure',
  'cpp',
  'css',
  'data',
  'devops',
  'dotnet',
  'elixir',
  'general',
  'golang',
  'graphql',
  'ios',
  'java',
  'javascript',
  'kotlin',
  'leadership',
  'networking',
  'php',
  'product',
  'python',
  'ruby',
  'rust',
  'scala',
  'security',
  'tech-comm',
  'typescript',
  'ux',
];

interface ConfsTechConference {
  name: string;
  url: string;
  startDate: string;
  endDate?: string;
  city?: string;
  country?: string;
  online?: boolean;
  cfpUrl?: string;
  cfpEndDate?: string;
  twitter?: string;
}

async function fetchTopicConferences(
  topic: string,
  year: number
): Promise<ConfsTechConference[]> {
  const url = `${CONFS_TECH_BASE_URL}/${year}/${topic}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as ConfsTechConference[];
  } catch {
    return [];
  }
}

function mapToScraperResult(
  conf: ConfsTechConference,
  topic: string
): ScraperResult | null {
  // Only include conferences with open CFPs
  if (!conf.cfpUrl) {
    return null;
  }

  // Skip if CFP has already ended
  if (conf.cfpEndDate) {
    const cfpEnd = new Date(conf.cfpEndDate);
    if (cfpEnd < new Date()) {
      return null;
    }
  }

  const location =
    conf.city && conf.country ? `${conf.city}, ${conf.country}` : conf.country;

  return {
    title: cleanTitle(conf.name),
    organization: conf.name,
    description: `Submit your talk proposal to ${conf.name}. ${conf.online ? 'This is an online event.' : location ? `Taking place in ${location}.` : ''}`,
    location: location || null,
    isRemote: conf.online || false,
    eventDate: conf.startDate ? new Date(conf.startDate) : undefined,
    cfpDeadline: conf.cfpEndDate ? new Date(conf.cfpEndDate) : undefined,
    format: 'conference',
    industries: normalizeIndustries(['technology', topic]),
    compensationType: undefined, // confs.tech doesn't provide compensation info
    compensationDetails: undefined,
    applyUrl: conf.cfpUrl,
    source: 'confs.tech',
    sourceUrl: conf.url,
  };
}

export async function scrapeConfsTech(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  const years = [CURRENT_YEAR, NEXT_YEAR];

  console.log('Fetching conferences from confs.tech...');

  for (const year of years) {
    for (const topic of TOPICS) {
      const conferences = await fetchTopicConferences(topic, year);

      for (const conf of conferences) {
        const result = mapToScraperResult(conf, topic);
        if (result) {
          // Check for duplicates by URL
          const exists = results.some((r) => r.applyUrl === result.applyUrl);
          if (!exists) {
            results.push(result);
          }
        }
      }
    }
  }

  console.log(`Found ${results.length} conferences with open CFPs from confs.tech`);
  return results;
}
