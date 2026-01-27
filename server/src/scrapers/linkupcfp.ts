import type { ScraperResult } from './index.js';

interface LinkupSearchResult {
  name: string;
  url: string;
  content: string;
}

interface LinkupResponse {
  results?: LinkupSearchResult[];
}

// Industry-specific search queries for CFP discovery
const INDUSTRY_CFP_QUERIES = [
  { query: 'healthcare medical conference call for speakers 2025 2026', industries: ['healthcare', 'medical'] },
  { query: 'fintech finance banking conference CFP speakers 2025 2026', industries: ['finance', 'fintech'] },
  { query: 'cybersecurity infosec security conference call for papers 2025 2026', industries: ['cybersecurity', 'security'] },
  { query: 'sustainability climate environment conference speakers wanted 2025 2026', industries: ['environment', 'sustainability'] },
  { query: 'energy renewable oil gas conference CFP 2025 2026', industries: ['energy'] },
  { query: 'marketing digital marketing conference call for speakers 2025 2026', industries: ['marketing'] },
  { query: 'HR human resources talent conference CFP 2025 2026', industries: ['hr', 'human resources'] },
  { query: 'education edtech learning conference call for speakers 2025 2026', industries: ['education', 'edtech'] },
  { query: 'retail ecommerce consumer conference CFP speakers 2025 2026', industries: ['retail', 'ecommerce'] },
  { query: 'manufacturing industry 4.0 conference call for papers 2025 2026', industries: ['manufacturing'] },
  { query: 'legal law tech conference CFP speakers 2025 2026', industries: ['legal'] },
  { query: 'real estate proptech conference call for speakers 2025 2026', industries: ['real estate', 'proptech'] },
  { query: 'agriculture agtech farming conference CFP 2025 2026', industries: ['agriculture', 'agtech'] },
  { query: 'entertainment media streaming conference call for speakers 2025 2026', industries: ['entertainment', 'media'] },
  { query: 'AI artificial intelligence machine learning conference CFP 2025 2026', industries: ['technology', 'AI', 'machine learning'] },
  { query: 'data science analytics conference call for speakers 2025 2026', industries: ['technology', 'data science'] },
  { query: 'cloud computing devops conference CFP 2025 2026', industries: ['technology', 'cloud', 'devops'] },
];

function extractOrganization(title: string): string {
  // Try to extract organization name from title
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

  // Check for CFP-related keywords
  const cfpIndicators = [
    'call for papers',
    'call for speakers',
    'call for presentations',
    'cfp',
    'submit a talk',
    'speaker submission',
    'proposal submission',
    'speaking opportunity',
  ];

  return cfpIndicators.some(
    (indicator) => lowerContent.includes(indicator) || lowerUrl.includes(indicator.replace(/\s+/g, ''))
  );
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

    const data: LinkupResponse = await response.json();
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
  // Skip if URL doesn't look like a CFP page
  if (!isLikelyCFP(result.content, result.url)) {
    return null;
  }

  // Skip aggregator sites (we want direct CFP pages)
  const aggregatorDomains = ['cfptime.org', 'wikicfp.com', 'papercall.io/events', 'confs.tech'];
  if (aggregatorDomains.some((domain) => result.url.includes(domain))) {
    return null;
  }

  const organization = extractOrganization(result.name);

  return {
    title: result.name,
    organization,
    description: result.content.substring(0, 500), // Truncate long descriptions
    location: null, // Would need NLP to extract
    isRemote: result.content.toLowerCase().includes('online') ||
              result.content.toLowerCase().includes('virtual') ||
              result.content.toLowerCase().includes('remote'),
    eventDate: undefined, // Would need NLP to extract dates
    cfpDeadline: undefined, // Would need NLP to extract dates
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

  // Limit concurrent requests
  for (const { query, industries } of INDUSTRY_CFP_QUERIES) {
    const searchResults = await searchWithLinkup(query, apiKey);

    for (const result of searchResults) {
      // Skip duplicates
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
