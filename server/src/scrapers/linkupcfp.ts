import type { ScraperResult } from './index.js';
import { cleanTitle, extractOrganization, normalizeIndustries } from '../services/dataNormalization.js';

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
  // --- Technology ---
  { query: withUsFocus('AI artificial intelligence machine learning conference call for speakers CFP'), industries: ['ai', 'machine learning'] },
  { query: withUsFocus('data science analytics conference call for speakers CFP'), industries: ['data science'] },
  { query: withUsFocus('cloud computing devops conference call for speakers CFP'), industries: ['cloud', 'devops'] },
  { query: withUsFocus('cybersecurity infosec conference call for papers CFP'), industries: ['cybersecurity'] },
  { query: withUsFocus('software engineering developer conference call for speakers CFP'), industries: ['software development'] },
  { query: withUsFocus('web development frontend backend conference call for speakers'), industries: ['web development'] },
  // --- Healthcare & Life Sciences ---
  { query: withUsFocus('healthcare medical conference call for speakers CFP'), industries: ['healthcare'] },
  { query: withUsFocus('biotech pharmaceutical conference call for speakers CFP'), industries: ['biotech', 'pharmaceutical'] },
  // --- Finance & Business ---
  { query: withUsFocus('fintech finance banking conference call for speakers CFP'), industries: ['finance', 'fintech'] },
  { query: withUsFocus('venture capital startup conference call for speakers CFP'), industries: ['startups', 'venture capital'] },
  { query: withUsFocus('insurance insurtech conference call for speakers CFP'), industries: ['insurance'] },
  // --- Professional Services ---
  { query: withUsFocus('marketing digital marketing conference call for speakers CFP'), industries: ['marketing'] },
  { query: withUsFocus('HR human resources talent conference call for speakers CFP'), industries: ['hr'] },
  { query: withUsFocus('legal law conference call for speakers CFP'), industries: ['legal'] },
  { query: withUsFocus('supply chain logistics conference call for speakers CFP'), industries: ['supply chain', 'logistics'] },
  // --- Industry & Infrastructure ---
  { query: withUsFocus('manufacturing industry conference call for speakers CFP'), industries: ['manufacturing'] },
  { query: withUsFocus('energy renewable conference call for speakers CFP'), industries: ['energy'] },
  { query: withUsFocus('real estate proptech conference call for speakers CFP'), industries: ['real estate'] },
  { query: withUsFocus('architecture construction conference call for speakers CFP'), industries: ['architecture', 'construction'] },
  { query: withUsFocus('automotive mobility conference call for speakers CFP'), industries: ['automotive'] },
  { query: withUsFocus('aerospace defense conference call for speakers CFP'), industries: ['aerospace', 'defense'] },
  { query: withUsFocus('telecom 5G conference call for speakers CFP'), industries: ['telecom'] },
  // --- Social Impact & Public Sector ---
  { query: withUsFocus('sustainability climate environment conference call for speakers CFP'), industries: ['sustainability'] },
  { query: withUsFocus('education edtech conference call for speakers CFP'), industries: ['education'] },
  { query: withUsFocus('nonprofit social impact conference call for speakers CFP'), industries: ['nonprofit'] },
  { query: withUsFocus('government public policy conference call for speakers CFP'), industries: ['government'] },
  // --- Creative & Media ---
  { query: withUsFocus('entertainment media conference call for speakers CFP'), industries: ['entertainment', 'media'] },
  { query: withUsFocus('design UX product conference call for speakers CFP'), industries: ['design', 'ux'] },
  // --- Format variety ---
  { query: withUsFocus('professional conference call for speakers open submissions'), industries: [] },
  { query: withUsFocus('podcast guest speaker application submit pitch'), industries: [] },
];

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
    /(\w+ \d{1,2})\s*[-–]\s*(\w+ \d{1,2},?\s*\d{4})/i,
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
  const results: LinkupSearchResult[] = [];
  const seen = new Set<string>();
  const maxPerPage = 25;
  const maxPages = 4;

  try {
    for (let page = 1; page <= maxPages; page++) {
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
          maxResults: maxPerPage,
          page,
        }),
      });

      if (!response.ok) {
        console.error('Linkup search error:', response.status);
        break;
      }

      const data = (await response.json()) as LinkupResponse;
      const pageResults = data.results || [];
      for (const item of pageResults) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        results.push(item);
      }

      if (pageResults.length < maxPerPage) break;
    }
  } catch (error) {
    console.error('Linkup search failed:', error);
    return [];
  }

  return results;
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
    title: cleanTitle(result.name),
    organization,
    description: result.content.substring(0, 500),
    location,
    isRemote: result.content.toLowerCase().includes('online') ||
              result.content.toLowerCase().includes('virtual') ||
              result.content.toLowerCase().includes('remote'),
    eventDate,
    cfpDeadline,
    format: 'conference',
    industries: normalizeIndustries(industries),
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
