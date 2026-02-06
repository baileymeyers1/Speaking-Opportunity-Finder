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

const US_FOCUS_SUFFIX = `USA United States ${CURRENT_YEAR} ${NEXT_YEAR}`;

function withUsFocus(query: string) {
  return `${query} ${US_FOCUS_SUFFIX}`;
}

// Industry-specific search queries for CFP discovery
const INDUSTRY_CFP_QUERIES = [
  { query: withUsFocus('healthcare medical conference call for speakers'), industries: ['healthcare', 'medical'] },
  { query: withUsFocus('fintech finance banking conference CFP speakers'), industries: ['finance', 'fintech'] },
  { query: withUsFocus('cybersecurity infosec security conference call for papers'), industries: ['cybersecurity', 'security'] },
  { query: withUsFocus('sustainability climate environment conference speakers wanted'), industries: ['environment', 'sustainability'] },
  { query: withUsFocus('energy renewable oil gas conference CFP'), industries: ['energy'] },
  { query: withUsFocus('marketing digital marketing conference call for speakers'), industries: ['marketing'] },
  { query: withUsFocus('HR human resources talent conference CFP'), industries: ['hr', 'human resources'] },
  { query: withUsFocus('education edtech learning conference call for speakers'), industries: ['education', 'edtech'] },
  { query: withUsFocus('retail ecommerce consumer conference CFP speakers'), industries: ['retail', 'ecommerce'] },
  { query: withUsFocus('manufacturing industry 4.0 conference call for papers'), industries: ['manufacturing'] },
  { query: withUsFocus('legal law tech conference CFP speakers'), industries: ['legal'] },
  { query: withUsFocus('real estate proptech conference call for speakers'), industries: ['real estate', 'proptech'] },
  { query: withUsFocus('agriculture agtech farming conference CFP'), industries: ['agriculture', 'agtech'] },
  { query: withUsFocus('entertainment media streaming conference call for speakers'), industries: ['entertainment', 'media'] },
  { query: withUsFocus('AI artificial intelligence machine learning conference CFP'), industries: ['technology', 'AI', 'machine learning'] },
  { query: withUsFocus('data science analytics conference call for speakers'), industries: ['technology', 'data science'] },
  { query: withUsFocus('cloud computing devops conference CFP'), industries: ['technology', 'cloud', 'devops'] },
  // Expanded industries
  { query: withUsFocus('nonprofit social impact conference call for speakers'), industries: ['nonprofit', 'social impact'] },
  { query: withUsFocus('government public policy conference CFP speakers'), industries: ['government', 'public policy'] },
  { query: withUsFocus('biotech pharmaceutical conference call for speakers'), industries: ['biotech', 'pharmaceutical'] },
  { query: withUsFocus('automotive mobility conference CFP speakers'), industries: ['automotive', 'mobility'] },
  { query: withUsFocus('aerospace defense conference call for speakers'), industries: ['aerospace', 'defense'] },
  { query: withUsFocus('food beverage hospitality conference CFP'), industries: ['food & beverage', 'hospitality'] },
  { query: withUsFocus('sports technology conference call for speakers'), industries: ['sports', 'sports tech'] },
  { query: withUsFocus('fashion apparel conference CFP speakers'), industries: ['fashion', 'apparel'] },
  { query: withUsFocus('architecture construction conference call for speakers'), industries: ['architecture', 'construction'] },
  { query: withUsFocus('telecom 5G conference CFP speakers'), industries: ['telecom', '5G'] },
  { query: withUsFocus('supply chain logistics conference call for speakers'), industries: ['supply chain', 'logistics'] },
  { query: withUsFocus('insurance insurtech conference CFP speakers'), industries: ['insurance', 'insurtech'] },
  { query: withUsFocus('venture capital startup conference call for speakers'), industries: ['venture capital', 'startups'] },
  { query: withUsFocus('conference call for speakers CFP'), industries: ['cross-industry'] },
  { query: withUsFocus('speaker application open CFP conference'), industries: ['cross-industry'] },
  { query: withUsFocus('conference call for speakers New York'), industries: ['cross-industry'] },
  { query: withUsFocus('conference call for speakers San Francisco'), industries: ['cross-industry'] },
  { query: withUsFocus('conference call for speakers Chicago'), industries: ['cross-industry'] },
  { query: withUsFocus('conference call for speakers Austin'), industries: ['cross-industry'] },
  { query: withUsFocus('conference call for speakers Las Vegas'), industries: ['cross-industry'] },
  { query: withUsFocus('conference call for speakers Washington DC'), industries: ['cross-industry'] },
  { query: withUsFocus('conference call for speakers Boston'), industries: ['cross-industry'] },
  { query: withUsFocus('conference call for speakers Seattle'), industries: ['cross-industry'] },
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

function extractLocation(content: string): string | null {
  const patterns = [
    /(?:in|held in|location:\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z]{2})?)/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/,
    /\b(United States|USA|US)\b/,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
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

function extractEventDate(content: string): Date | undefined {
  const patterns = [
    /(?:event date|event dates|conference dates|takes place|held on|when)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i,
    /(?:event dates|conference dates)[:\s]*(\w+ \d{1,2})\s*[-–]\s*(\w+ \d{1,2},?\s*\d{4})/i,
    /(\w+ \d{1,2},?\s*\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const dateStr = match[2] || match[1];
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
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
        maxResults: 25,
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
  const location = extractLocation(result.content);
  const compensation = extractCompensation(result.content);
  const eventDate = extractEventDate(result.content);

  return {
    title: result.name,
    organization,
    description: result.content.substring(0, 500),
    location,
    isRemote: result.content.toLowerCase().includes('online') ||
              result.content.toLowerCase().includes('virtual') ||
              result.content.toLowerCase().includes('remote'),
    eventDate,
    cfpDeadline,
    format: 'conference',
    industries,
    compensationType: compensation.compensationType,
    compensationAmount: compensation.compensationAmount,
    compensationDetails: compensation.compensationType ? result.content.substring(0, 300) : undefined,
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
