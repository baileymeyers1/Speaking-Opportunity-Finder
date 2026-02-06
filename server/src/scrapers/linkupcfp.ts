import type { ScraperResult } from './index.js';

interface LinkupSearchResult {
  name: string;
  url: string;
  content: string;
}

interface LinkupResponse {
  results?: LinkupSearchResult[];
}

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

// Industry-specific search queries for CFP discovery
const INDUSTRY_CFP_QUERIES = [
  { query: `healthcare medical conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['healthcare', 'medical'] },
  { query: `fintech finance banking conference CFP speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['finance', 'fintech'] },
  { query: `cybersecurity infosec security conference call for papers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['cybersecurity', 'security'] },
  { query: `sustainability climate environment conference speakers wanted ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['environment', 'sustainability'] },
  { query: `energy renewable oil gas conference CFP ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['energy'] },
  { query: `marketing digital marketing conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['marketing'] },
  { query: `HR human resources talent conference CFP ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['hr', 'human resources'] },
  { query: `education edtech learning conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['education', 'edtech'] },
  { query: `retail ecommerce consumer conference CFP speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['retail', 'ecommerce'] },
  { query: `manufacturing industry 4.0 conference call for papers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['manufacturing'] },
  { query: `legal law tech conference CFP speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['legal'] },
  { query: `real estate proptech conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['real estate', 'proptech'] },
  { query: `agriculture agtech farming conference CFP ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['agriculture', 'agtech'] },
  { query: `entertainment media streaming conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['entertainment', 'media'] },
  { query: `AI artificial intelligence machine learning conference CFP ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['technology', 'AI', 'machine learning'] },
  { query: `data science analytics conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['technology', 'data science'] },
  { query: `cloud computing devops conference CFP ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['technology', 'cloud', 'devops'] },
  // Expanded industries
  { query: `nonprofit social impact conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['nonprofit', 'social impact'] },
  { query: `government public policy conference CFP speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['government', 'public policy'] },
  { query: `biotech pharmaceutical conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['biotech', 'pharmaceutical'] },
  { query: `automotive mobility conference CFP speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['automotive', 'mobility'] },
  { query: `aerospace defense conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['aerospace', 'defense'] },
  { query: `food beverage hospitality conference CFP ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['food & beverage', 'hospitality'] },
  { query: `sports technology conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['sports', 'sports tech'] },
  { query: `fashion apparel conference CFP speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['fashion', 'apparel'] },
  { query: `architecture construction conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['architecture', 'construction'] },
  { query: `telecom 5G conference CFP speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['telecom', '5G'] },
  { query: `supply chain logistics conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['supply chain', 'logistics'] },
  { query: `insurance insurtech conference CFP speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['insurance', 'insurtech'] },
  { query: `venture capital startup conference call for speakers ${CURRENT_YEAR} ${NEXT_YEAR}`, industries: ['venture capital', 'startups'] },
];

function extractOrganization(title: string): string {
  const separators = [' - ', ' | ', ' by ', ' @ ', ' at '];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      return parts[0].trim();
    }
  }
  return title;
}

function isLikelyCFP(content: string, url: string): boolean {
  const lowerContent = content.toLowerCase();
  const lowerUrl = url.toLowerCase();

  const cfpIndicators = [
    'call for papers',
    'call for speakers',
    'call for presentations',
    'cfp',
    'submit a talk',
    'speaker submission',
    'proposal submission',
    'speaking opportunity',
    'call for proposals',
    'submit your abstract',
    'speaker application',
  ];

  return cfpIndicators.some(
    (indicator) => lowerContent.includes(indicator) || lowerUrl.includes(indicator.replace(/\s+/g, ''))
  );
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

async function searchWithLinkup(
  query: string,
  apiKey: string
): Promise<LinkupSearchResult[]> {
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
      console.error('Linkup search error:', response.status);
      return [];
    }

    const data = (await response.json()) as LinkupResponse;
    return data.results || [];
  } catch (error) {
    console.error('Linkup search failed:', error);
    return [];
  }
}

function mapToScraperResult(
  result: LinkupSearchResult,
  industries: string[]
): ScraperResult | null {
  if (!isLikelyCFP(result.content, result.url)) {
    return null;
  }

  // Skip aggregator sites (we want direct CFP pages)
  const aggregatorDomains = ['cfptime.org', 'wikicfp.com', 'papercall.io/events', 'confs.tech'];
  if (aggregatorDomains.some((domain) => result.url.includes(domain))) {
    return null;
  }

  const organization = extractOrganization(result.name);
  const cfpDeadline = extractDeadline(result.content);

  return {
    title: result.name,
    organization,
    description: result.content.substring(0, 500),
    location: null,
    isRemote: result.content.toLowerCase().includes('online') ||
              result.content.toLowerCase().includes('virtual') ||
              result.content.toLowerCase().includes('remote'),
    eventDate: undefined,
    cfpDeadline,
    format: 'conference',
    industries,
    compensationType: undefined,
    compensationDetails: undefined,
    applyUrl: result.url,
    source: 'Linkup Search',
    sourceUrl: result.url,
  };
}

export async function scrapeLinkupCFPs(apiKey?: string): Promise<ScraperResult[]> {
  if (!apiKey) {
    console.log('Linkup API key not configured, skipping CFP discovery...');
    return [];
  }

  console.log('Discovering CFPs via Linkup search...');

  const results: ScraperResult[] = [];
  const seenUrls = new Set<string>();

  for (const { query, industries } of INDUSTRY_CFP_QUERIES) {
    const searchResults = await searchWithLinkup(query, apiKey);

    for (const result of searchResults) {
      if (seenUrls.has(result.url)) {
        continue;
      }

      const scraperResult = mapToScraperResult(result, industries);
      if (scraperResult) {
        results.push(scraperResult);
        seenUrls.add(result.url);
      }
    }

    // Small delay between requests to be respectful
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`Found ${results.length} CFPs via Linkup search`);
  return results;
}
