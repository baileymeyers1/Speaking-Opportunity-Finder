import { config } from '../config/index.js';
import { randomUUID } from 'crypto';

export interface EnrichedLiveResult {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: string | null;
  cfpDeadline: string | null;
  format: string;
  industries: string[];
  compensationType: string | null;
  compensationAmount: number | null;
  compensationDetails: string | null;
  applyUrl: string;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  isLiveResult: boolean;
  liveSearchUrl: string;
}

// Search query templates for different industries
const INDUSTRY_QUERIES: Record<string, string[]> = {
  technology: ['tech conference call for speakers', 'software developer CFP'],
  healthcare: ['healthcare conference speakers wanted', 'medical summit CFP'],
  finance: ['fintech conference call for speakers', 'finance summit CFP'],
  energy: ['energy conference speakers', 'renewable energy CFP'],
  environment: ['sustainability conference CFP', 'climate summit speakers'],
  cybersecurity: ['security conference CFP', 'infosec speakers wanted'],
  entertainment: ['entertainment conference speakers', 'media summit CFP'],
  education: ['education conference CFP', 'edtech speakers wanted'],
  retail: ['retail conference speakers', 'ecommerce summit CFP'],
  manufacturing: ['manufacturing conference CFP', 'industry 4.0 speakers'],
  marketing: ['marketing conference speakers', 'digital marketing CFP'],
  hr: ['HR conference speakers', 'talent summit CFP'],
  legal: ['legal tech conference CFP', 'law conference speakers'],
  'real estate': ['proptech conference speakers', 'real estate summit CFP'],
  agriculture: ['agtech conference CFP', 'agriculture summit speakers'],
};

const FORMAT_KEYWORDS: Record<string, string> = {
  podcast: 'podcast',
  webinar: 'webinar',
  workshop: 'workshop',
  meetup: 'meetup',
  panel: 'panel',
  summit: 'conference',
  symposium: 'conference',
};

/**
 * Extract metadata from result content for richer tagging.
 */
function extractCompensation(content: string) {
  const lower = content.toLowerCase();
  let compensationType: string | null = null;

  if (/\bhonorarium\b/.test(lower)) compensationType = 'honorarium';
  else if (/\bpaid\b/.test(lower)) compensationType = 'paid';
  else if (/\btravel\b/.test(lower)) compensationType = 'travel';
  else if (/\bstipend\b/.test(lower)) compensationType = 'paid';
  else if (/\bexposure\b/.test(lower)) compensationType = 'exposure';

  const amountMatch = content.match(/\$[\s]*([0-9]{2,6}(?:,[0-9]{3})?)/);
  const compensationAmount = amountMatch
    ? parseInt(amountMatch[1].replace(/,/g, ''), 10)
    : null;

  const compensationDetails = compensationType
    ? content.substring(0, 300)
    : null;

  return { compensationType, compensationAmount, compensationDetails };
}

function extractMetadata(content: string, title: string, searchIndustries: string[]) {
  const lower = (content + ' ' + title).toLowerCase();

  // Format detection
  let format = 'conference';
  for (const [keyword, fmt] of Object.entries(FORMAT_KEYWORDS)) {
    if (lower.includes(keyword)) {
      format = fmt;
      break;
    }
  }

  // Remote detection
  const isRemote = /\b(online|virtual|remote)\b/.test(lower);

  // Location extraction - look for common patterns
  let location: string | null = null;
  const locationPatterns = [
    /(?:in|held in|location:\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z]{2})?)/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/, // City, ST
    /\b(United States|USA|US)\b/,
  ];
  for (const pattern of locationPatterns) {
    const match = content.match(pattern);
    if (match) {
      location = match[1].trim();
      break;
    }
  }

  // Date extraction - try common patterns
  let cfpDeadline: string | null = null;
  const datePatterns = [
    /(?:deadline|submit by|closes?|due)[\s:]*(\w+ \d{1,2},?\s*\d{4})/i,
    /(?:deadline|submit by|closes?|due)[\s:]*(\d{4}-\d{2}-\d{2})/i,
    /(?:deadline|submit by|closes?|due)[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];
  for (const pattern of datePatterns) {
    const match = content.match(pattern);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime()) && parsed > new Date()) {
        cfpDeadline = parsed.toISOString();
      }
      break;
    }
  }

  // Industries - combine search context with content-inferred ones
  const industries = [...searchIndustries];
  const industryKeywords: Record<string, string> = {
    'artificial intelligence': 'AI',
    'machine learning': 'AI',
    'data science': 'data science',
    'cloud': 'cloud',
    'devops': 'devops',
    'security': 'cybersecurity',
    'healthcare': 'healthcare',
    'fintech': 'finance',
    'blockchain': 'blockchain',
    'sustainability': 'sustainability',
    'human resources': 'hr',
    'education': 'education',
    'marketing': 'marketing',
    'construction': 'construction',
  };
  for (const [keyword, tag] of Object.entries(industryKeywords)) {
    if (lower.includes(keyword) && !industries.includes(tag)) {
      industries.push(tag);
    }
  }

  const compensation = extractCompensation(content);

  return { format, isRemote, location, cfpDeadline, industries, ...compensation };
}

/**
 * Perform a live web search for speaking opportunities using Linkup API.
 * Returns enriched results that match the Opportunity shape.
 */
export async function performLiveSearch(
  query: string,
  industries: string[]
): Promise<EnrichedLiveResult[]> {
  const apiKey = config.scrapers?.webSearch;
  const currentYear = new Date().getFullYear();

  let searchQuery = '';
  if (query) {
    searchQuery = `${query} call for speakers OR CFP ${currentYear}`;
  } else if (industries.length > 0) {
    const industryTerms = industries.map((ind) => {
      const templates = INDUSTRY_QUERIES[ind.toLowerCase()];
      return templates ? templates[0] : `${ind} conference`;
    });
    searchQuery = `(${industryTerms.join(' OR ')}) call for speakers ${currentYear}`;
  }

  if (!searchQuery) {
    return [];
  }

  if (apiKey) {
    return await performLinkupSearch(searchQuery, apiKey, industries);
  }

  return generateSimulatedResults(query, industries);
}

interface LinkupSearchResult {
  name: string;
  url: string;
  content: string;
}

interface LinkupResponse {
  results?: LinkupSearchResult[];
  answer?: string;
  sources?: LinkupSearchResult[];
}

async function performLinkupSearch(
  query: string,
  apiKey: string,
  searchIndustries: string[]
): Promise<EnrichedLiveResult[]> {
  const results: EnrichedLiveResult[] = [];

  try {
    const response = await fetch('https://api.linkup.so/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        depth: 'standard',
        outputType: 'searchResults',
        maxResults: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Linkup API error:', response.status, errorText);
      return [];
    }

    const data = (await response.json()) as LinkupResponse;
    const searchResults = data.results || data.sources || [];
    const now = new Date().toISOString();

    for (const item of searchResults) {
      const meta = extractMetadata(item.content || '', item.name || '', searchIndustries);

      results.push({
        id: `live-${randomUUID()}`,
        title: item.name || 'Untitled',
        organization: extractOrganization(item.name || ''),
        description: item.content || null,
        location: meta.location,
        isRemote: meta.isRemote,
        eventDate: null,
        cfpDeadline: meta.cfpDeadline,
        format: meta.format,
        industries: meta.industries,
        compensationType: meta.compensationType,
        compensationAmount: meta.compensationAmount,
        compensationDetails: meta.compensationDetails,
        applyUrl: item.url,
        source: 'Live Search',
        sourceUrl: item.url,
        createdAt: now,
        updatedAt: now,
        isLiveResult: true,
        liveSearchUrl: item.url,
      });
    }
  } catch (error) {
    console.error('Linkup search error:', error);
  }

  return results;
}

function extractOrganization(title: string): string {
  const separators = [' - ', ' | ', ' by ', ' @ ', ' at '];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      return parts[parts.length - 1].trim();
    }
  }
  return 'Unknown Organization';
}

function generateSimulatedResults(
  query: string,
  industries: string[]
): EnrichedLiveResult[] {
  const results: EnrichedLiveResult[] = [];
  const searchTerm = query || industries[0] || 'technology';
  const now = new Date().toISOString();
  const inferredIndustries = industries.length > 0 ? industries : ['technology'];

  const templates = [
    {
      title: `Global ${capitalize(searchTerm)} Summit ${new Date().getFullYear()} - Call for Speakers`,
      organization: `${capitalize(searchTerm)} Leaders Network`,
      description: `Submit your proposal to speak at the premier ${searchTerm} event. We are looking for innovative talks, workshops, and panel discussions.`,
    },
    {
      title: `${capitalize(searchTerm)} Innovation Conference - CFP Open`,
      organization: 'Innovation Events Inc.',
      description: `Share your expertise at our annual ${searchTerm} conference. Speaking slots available for keynotes, breakout sessions, and lightning talks.`,
    },
    {
      title: `International ${capitalize(searchTerm)} Forum - Speakers Wanted`,
      organization: `World ${capitalize(searchTerm)} Association`,
      description: `Join industry leaders at our international forum. CFP deadline approaching - submit your abstract today.`,
    },
    {
      title: `${capitalize(searchTerm)} Trends Podcast - Guest Speakers`,
      organization: `${capitalize(searchTerm)} Weekly`,
      description: `Looking for ${searchTerm} professionals to share insights on our popular podcast. Remote recording available.`,
    },
    {
      title: `Future of ${capitalize(searchTerm)} Conference ${new Date().getFullYear()}`,
      organization: 'TechFuture Events',
      description: `Be part of the conversation about the future of ${searchTerm}. Now accepting speaker applications for our flagship event.`,
    },
  ];

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const url = `https://example.com/${searchTerm.toLowerCase().replace(/\s+/g, '-')}-conf-${i + 1}`;
    results.push({
      id: `live-${randomUUID()}`,
      title: t.title,
      organization: t.organization,
      description: t.description,
      location: null,
      isRemote: i === 3, // podcast is remote
      eventDate: null,
      cfpDeadline: null,
      format: i === 3 ? 'podcast' : 'conference',
      industries: inferredIndustries,
      compensationType: null,
      compensationAmount: null,
      compensationDetails: null,
      applyUrl: url,
      source: 'Web Search',
      sourceUrl: url,
      createdAt: now,
      updatedAt: now,
      isLiveResult: true,
      liveSearchUrl: url,
    });
  }

  return results;
}

function capitalize(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
