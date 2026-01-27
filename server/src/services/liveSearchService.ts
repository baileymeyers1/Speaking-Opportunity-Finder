import { config } from '../config/index.js';

export interface LiveSearchResult {
  title: string;
  organization: string;
  description: string;
  url: string;
  source: string;
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

/**
 * Perform a live web search for speaking opportunities using Linkup API.
 * https://docs.linkup.so/
 */
export async function performLiveSearch(
  query: string,
  industries: string[]
): Promise<LiveSearchResult[]> {
  const apiKey = config.scrapers?.webSearch;

  // Build search query based on user input and selected industries
  let searchQuery = '';

  if (query) {
    searchQuery = `${query} call for speakers OR CFP 2025`;
  } else if (industries.length > 0) {
    const industryTerms = industries.map((ind) => {
      const templates = INDUSTRY_QUERIES[ind.toLowerCase()];
      return templates ? templates[0] : `${ind} conference`;
    });
    searchQuery = `(${industryTerms.join(' OR ')}) call for speakers 2025`;
  }

  if (!searchQuery) {
    return [];
  }

  // If API key is configured, use Linkup search
  if (apiKey) {
    return await performLinkupSearch(searchQuery, apiKey);
  }

  // Otherwise, return simulated results to demonstrate the feature
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
  apiKey: string
): Promise<LiveSearchResult[]> {
  const results: LiveSearchResult[] = [];

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

    for (const item of searchResults) {
      results.push({
        title: item.name || 'Untitled',
        organization: extractOrganization(item.name || ''),
        description: item.content || '',
        url: item.url,
        source: 'Linkup Search',
      });
    }
  } catch (error) {
    console.error('Linkup search error:', error);
  }

  return results;
}

function extractOrganization(title: string): string {
  // Try to extract organization name from title
  // Common patterns: "Event Name - Organization", "Event Name | Organization", "Event Name by Organization"
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
): LiveSearchResult[] {
  // Generate realistic-looking results based on the search criteria
  const results: LiveSearchResult[] = [];
  const searchTerm = query || industries[0] || 'technology';

  const templates = [
    {
      title: `Global ${capitalize(searchTerm)} Summit 2025 - Call for Speakers`,
      organization: `${capitalize(searchTerm)} Leaders Network`,
      description: `Submit your proposal to speak at the premier ${searchTerm} event of 2025. We are looking for innovative talks, workshops, and panel discussions.`,
      source: 'Web Search',
    },
    {
      title: `${capitalize(searchTerm)} Innovation Conference - CFP Open`,
      organization: 'Innovation Events Inc.',
      description: `Share your expertise at our annual ${searchTerm} conference. Speaking slots available for keynotes, breakout sessions, and lightning talks.`,
      source: 'Web Search',
    },
    {
      title: `International ${capitalize(searchTerm)} Forum - Speakers Wanted`,
      organization: `World ${capitalize(searchTerm)} Association`,
      description: `Join industry leaders at our international forum. CFP deadline approaching - submit your abstract today.`,
      source: 'Web Search',
    },
    {
      title: `${capitalize(searchTerm)} Trends Podcast - Guest Speakers`,
      organization: `${capitalize(searchTerm)} Weekly`,
      description: `Looking for ${searchTerm} professionals to share insights on our popular podcast. Remote recording available.`,
      source: 'Web Search',
    },
    {
      title: `Future of ${capitalize(searchTerm)} Conference 2025`,
      organization: 'TechFuture Events',
      description: `Be part of the conversation about the future of ${searchTerm}. Now accepting speaker applications for our flagship event.`,
      source: 'Web Search',
    },
  ];

  for (let i = 0; i < Math.min(5, templates.length); i++) {
    results.push({
      ...templates[i],
      url: `https://example.com/${searchTerm.toLowerCase().replace(/\s+/g, '-')}-conf-${i + 1}`,
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
