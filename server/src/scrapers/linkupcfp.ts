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
  // --- Technology (normalized, not over-represented) ---
  { query: withUsFocus('AI artificial intelligence machine learning conference call for speakers CFP'), industries: ['ai', 'machine learning'] },
  { query: withUsFocus('data science analytics conference call for speakers CFP'), industries: ['data science'] },
  { query: withUsFocus('cloud computing devops conference call for speakers CFP'), industries: ['cloud', 'devops'] },
  { query: withUsFocus('cybersecurity infosec conference call for papers CFP'), industries: ['cybersecurity'] },
  { query: withUsFocus('software engineering developer conference call for speakers CFP'), industries: ['software development'] },
  { query: withUsFocus('blockchain web3 conference call for speakers CFP'), industries: ['blockchain'] },
  { query: withUsFocus('IoT internet of things conference call for speakers CFP'), industries: ['iot'] },

  // --- Business & Professional ---
  { query: withUsFocus('sales conference call for speakers CFP'), industries: ['sales'] },
  { query: withUsFocus('marketing digital marketing conference call for speakers CFP'), industries: ['marketing'] },
  { query: withUsFocus('advertising conference call for speakers CFP'), industries: ['advertising'] },
  { query: withUsFocus('public relations PR conference call for speakers CFP'), industries: ['public relations'] },
  { query: withUsFocus('HR human resources recruiting conference call for speakers CFP'), industries: ['hr', 'recruiting'] },
  { query: withUsFocus('management leadership conference call for speakers CFP'), industries: ['management', 'leadership'] },
  { query: withUsFocus('entrepreneurship startup conference call for speakers CFP'), industries: ['entrepreneurship', 'startups'] },
  { query: withUsFocus('venture capital conference call for speakers CFP'), industries: ['venture capital'] },
  { query: withUsFocus('business strategy operations conference call for speakers CFP'), industries: ['business strategy', 'operations'] },
  { query: withUsFocus('supply chain logistics conference call for speakers CFP'), industries: ['supply chain', 'logistics'] },
  { query: withUsFocus('consulting professional services conference call for speakers CFP'), industries: ['consulting'] },

  // --- Creative & Media ---
  { query: withUsFocus('entertainment film television conference call for speakers CFP'), industries: ['entertainment', 'film'] },
  { query: withUsFocus('music industry conference call for speakers CFP'), industries: ['music'] },
  { query: withUsFocus('gaming esports conference call for speakers CFP'), industries: ['gaming', 'esports'] },
  { query: withUsFocus('media journalism conference call for speakers CFP'), industries: ['media', 'journalism'] },
  { query: withUsFocus('publishing content creation conference call for speakers CFP'), industries: ['publishing', 'content creation'] },
  { query: withUsFocus('photography animation conference call for speakers CFP'), industries: ['photography', 'animation'] },
  { query: withUsFocus('podcasting conference call for speakers CFP'), industries: ['podcasting'] },

  // --- Design & Arts ---
  { query: withUsFocus('graphic design conference call for speakers CFP'), industries: ['graphic design'] },
  { query: withUsFocus('UX UI design conference call for speakers CFP'), industries: ['ux', 'design'] },
  { query: withUsFocus('industrial design conference call for speakers CFP'), industries: ['industrial design'] },
  { query: withUsFocus('architecture conference call for speakers CFP'), industries: ['architecture'] },
  { query: withUsFocus('interior design conference call for speakers CFP'), industries: ['interior design'] },
  { query: withUsFocus('fashion industry conference call for speakers CFP'), industries: ['fashion'] },
  { query: withUsFocus('fine arts conference call for speakers CFP'), industries: ['fine arts'] },

  // --- Science & Research ---
  { query: withUsFocus('biology life sciences conference call for speakers CFP'), industries: ['biology'] },
  { query: withUsFocus('chemistry conference call for speakers CFP'), industries: ['chemistry'] },
  { query: withUsFocus('physics conference call for speakers CFP'), industries: ['physics'] },
  { query: withUsFocus('space astronomy conference call for speakers CFP'), industries: ['space', 'astronomy'] },
  { query: withUsFocus('environmental science climate conference call for speakers CFP'), industries: ['environmental science', 'climate'] },
  { query: withUsFocus('geology earth science conference call for speakers CFP'), industries: ['geology'] },
  { query: withUsFocus('marine science oceanography conference call for speakers CFP'), industries: ['marine science'] },

  // --- Healthcare & Wellness ---
  { query: withUsFocus('healthcare medical conference call for speakers CFP'), industries: ['healthcare'] },
  { query: withUsFocus('nursing conference call for speakers CFP'), industries: ['nursing'] },
  { query: withUsFocus('public health conference call for speakers CFP'), industries: ['public health'] },
  { query: withUsFocus('mental health psychology conference call for speakers CFP'), industries: ['mental health'] },
  { query: withUsFocus('pharmacy pharmaceutical conference call for speakers CFP'), industries: ['pharmacy', 'pharmaceutical'] },
  { query: withUsFocus('dentistry dental conference call for speakers CFP'), industries: ['dentistry'] },
  { query: withUsFocus('wellness fitness nutrition conference call for speakers CFP'), industries: ['wellness', 'fitness', 'nutrition'] },

  // --- Finance & Economics ---
  { query: withUsFocus('fintech finance banking conference call for speakers CFP'), industries: ['finance', 'fintech'] },
  { query: withUsFocus('insurance insurtech conference call for speakers CFP'), industries: ['insurance'] },
  { query: withUsFocus('accounting conference call for speakers CFP'), industries: ['accounting'] },
  { query: withUsFocus('investment wealth management conference call for speakers CFP'), industries: ['investment'] },
  { query: withUsFocus('real estate proptech conference call for speakers CFP'), industries: ['real estate'] },
  { query: withUsFocus('economics conference call for speakers CFP'), industries: ['economics'] },

  // --- Education ---
  { query: withUsFocus('K-12 education conference call for speakers CFP'), industries: ['k-12 education'] },
  { query: withUsFocus('higher education university conference call for speakers CFP'), industries: ['higher education'] },
  { query: withUsFocus('edtech online learning conference call for speakers CFP'), industries: ['edtech'] },
  { query: withUsFocus('special education conference call for speakers CFP'), industries: ['special education'] },
  { query: withUsFocus('STEM education conference call for speakers CFP'), industries: ['stem education'] },

  // --- Government & Policy ---
  { query: withUsFocus('public policy government conference call for speakers CFP'), industries: ['public policy', 'government'] },
  { query: withUsFocus('nonprofit social impact conference call for speakers CFP'), industries: ['nonprofit', 'social impact'] },
  { query: withUsFocus('international relations conference call for speakers CFP'), industries: ['international relations'] },
  { query: withUsFocus('defense military conference call for speakers CFP'), industries: ['defense'] },

  // --- Engineering ---
  { query: withUsFocus('civil engineering conference call for speakers CFP'), industries: ['civil engineering'] },
  { query: withUsFocus('mechanical engineering conference call for speakers CFP'), industries: ['mechanical engineering'] },
  { query: withUsFocus('electrical engineering conference call for speakers CFP'), industries: ['electrical engineering'] },
  { query: withUsFocus('aerospace engineering conference call for speakers CFP'), industries: ['aerospace'] },
  { query: withUsFocus('automotive engineering conference call for speakers CFP'), industries: ['automotive'] },

  // --- Legal ---
  { query: withUsFocus('legal law conference call for speakers CFP'), industries: ['legal'] },
  { query: withUsFocus('compliance regulation conference call for speakers CFP'), industries: ['compliance', 'regulation'] },
  { query: withUsFocus('intellectual property privacy conference call for speakers CFP'), industries: ['intellectual property', 'privacy'] },

  // --- Agriculture & Food ---
  { query: withUsFocus('agriculture farming conference call for speakers CFP'), industries: ['agriculture'] },
  { query: withUsFocus('food science conference call for speakers CFP'), industries: ['food science'] },
  { query: withUsFocus('sustainability agtech conference call for speakers CFP'), industries: ['sustainability', 'agtech'] },

  // --- Transportation & Logistics ---
  { query: withUsFocus('aviation conference call for speakers CFP'), industries: ['aviation'] },
  { query: withUsFocus('shipping logistics conference call for speakers CFP'), industries: ['shipping', 'logistics'] },
  { query: withUsFocus('urban planning smart cities conference call for speakers CFP'), industries: ['urban planning', 'smart cities'] },

  // --- Energy ---
  { query: withUsFocus('renewable energy clean tech conference call for speakers CFP'), industries: ['renewable energy', 'clean tech'] },
  { query: withUsFocus('oil gas energy conference call for speakers CFP'), industries: ['oil and gas', 'energy'] },
  { query: withUsFocus('nuclear energy utilities conference call for speakers CFP'), industries: ['nuclear energy'] },

  // --- Sports & Recreation ---
  { query: withUsFocus('sports management conference call for speakers CFP'), industries: ['sports management'] },
  { query: withUsFocus('esports gaming industry conference call for speakers CFP'), industries: ['esports'] },
  { query: withUsFocus('fitness industry event management conference call for speakers CFP'), industries: ['fitness', 'event management'] },

  // --- Hospitality & Tourism ---
  { query: withUsFocus('hospitality hotel conference call for speakers CFP'), industries: ['hospitality'] },
  { query: withUsFocus('travel tourism conference call for speakers CFP'), industries: ['travel', 'tourism'] },
  { query: withUsFocus('restaurant food service conference call for speakers CFP'), industries: ['restaurants'] },
  { query: withUsFocus('event planning conference call for speakers CFP'), industries: ['event planning'] },

  // --- Manufacturing ---
  { query: withUsFocus('manufacturing industry 4.0 conference call for speakers CFP'), industries: ['manufacturing'] },
  { query: withUsFocus('telecom 5G conference call for speakers CFP'), industries: ['telecom'] },

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
