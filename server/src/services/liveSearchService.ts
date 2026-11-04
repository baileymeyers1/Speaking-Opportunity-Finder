import { config } from '../config/index.js';
import { randomUUID } from 'crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { assignEvents } from './eventAssignment.js';
import { cleanTitle, extractOrganization, normalizeIndustries, decodeHtmlEntities, isJunkResult } from './dataNormalization.js';
import {
  extractOpportunitiesBatch,
  mergeExtraction,
  serializeDateConfidence,
  type DateConfidence,
  type ExtractionResult,
} from './extraction.js';
import { fetchPageText } from './pageText.js';
import { mapWithConcurrency, parseHumanDate } from '../scrapers/lib/html.js';
import { endOfCalendarDay } from '../lib/deadlines.js';
import { buildCreateData } from '../scrapers/persistData.js';
import type { ScraperResult } from '../scrapers/qualityScore.js';

/** Live hits enriched synchronously per request; the enrichment cron finishes the rest. */
export const SYNC_ENRICH_LIMIT = 8;

export interface EnrichedLiveResult {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: string | null;
  cfpDeadline: string | null;
  /** Set by Claude extraction when the page states a zone; null = read as AoE. */
  deadlineTimezone?: string | null;
  format: string;
  industries: string[];
  compensationType: string | null;
  compensationAmount: number | null;
  compensationDetails: string | null;
  applyUrl: string;
  qualityScore: number;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  isLiveResult: boolean;
  liveSearchUrl: string;
  matchesLocationFilter?: boolean;
  /** Set by Claude extraction: the call is closed. Dropped before results are returned. */
  isClosed?: boolean;
  /** Set by Claude extraction: false when the page is not a speaking opportunity. */
  isRelevant?: boolean;
  dateConfidence?: DateConfidence | null;
  /** True once a Claude extraction was applied to this result. */
  extracted?: boolean;
  /** True when the apply page itself was fetched (so the extraction counts as a verification). */
  pageFetched?: boolean;
}

// Search query templates for different industries
const INDUSTRY_QUERIES: Record<string, string[]> = {
  // --- Technology ---
  technology: ['tech conference call for speakers', 'software developer CFP'],
  ai: ['AI machine learning conference CFP', 'artificial intelligence speakers wanted'],
  'data science': ['data science analytics conference CFP', 'data engineering speakers wanted'],
  cloud: ['cloud computing conference CFP', 'cloud infrastructure speakers wanted'],
  devops: ['devops conference call for speakers', 'platform engineering CFP'],
  cybersecurity: ['security conference CFP', 'infosec speakers wanted'],
  blockchain: ['blockchain web3 conference CFP', 'crypto conference speakers'],
  iot: ['IoT internet of things conference CFP', 'connected devices speakers'],

  // --- Business & Professional ---
  sales: ['sales conference call for speakers', 'sales summit CFP'],
  marketing: ['marketing conference speakers', 'digital marketing CFP'],
  advertising: ['advertising conference call for speakers', 'ad industry summit CFP'],
  'public relations': ['public relations PR conference CFP', 'communications summit speakers'],
  hr: ['HR conference speakers', 'talent summit CFP', 'recruiting conference CFP'],
  management: ['management leadership conference CFP', 'executive summit speakers'],
  leadership: ['leadership conference call for speakers', 'leadership summit CFP'],
  entrepreneurship: ['entrepreneurship startup conference CFP', 'founder summit speakers'],
  startups: ['startup conference call for speakers', 'startup summit CFP'],
  'venture capital': ['venture capital conference CFP', 'VC investor summit speakers'],
  'business strategy': ['business strategy conference CFP', 'strategy summit speakers'],
  operations: ['operations management conference CFP', 'business operations speakers'],
  'supply chain': ['supply chain logistics conference CFP', 'supply chain summit speakers'],
  consulting: ['consulting conference call for speakers', 'professional services CFP'],

  // --- Creative & Media ---
  entertainment: ['entertainment conference speakers', 'media summit CFP'],
  film: ['film industry conference CFP', 'filmmaking summit speakers'],
  television: ['television media conference CFP', 'TV industry speakers wanted'],
  music: ['music industry conference CFP', 'music summit speakers'],
  gaming: ['gaming conference call for speakers', 'game industry CFP'],
  media: ['media conference call for speakers', 'media industry summit CFP'],
  journalism: ['journalism conference CFP', 'media journalism speakers wanted'],
  publishing: ['publishing conference call for speakers', 'book publishing CFP'],
  'content creation': ['content creation conference CFP', 'creator economy speakers'],
  photography: ['photography conference call for speakers', 'photography summit CFP'],
  animation: ['animation conference call for speakers', 'animation industry CFP'],
  podcasting: ['podcasting conference CFP', 'podcast industry speakers wanted'],

  // --- Design & Arts ---
  'graphic design': ['graphic design conference CFP', 'design conference speakers'],
  ux: ['UX design conference CFP', 'user experience speakers wanted'],
  design: ['design conference call for speakers', 'design summit CFP'],
  'industrial design': ['industrial design conference CFP', 'product design speakers'],
  architecture: ['architecture conference call for speakers', 'architecture summit CFP'],
  'interior design': ['interior design conference CFP', 'interior design speakers wanted'],
  fashion: ['fashion industry conference CFP', 'fashion summit speakers'],
  'fine arts': ['fine arts conference call for speakers', 'arts summit CFP'],

  // --- Science & Research ---
  biology: ['biology life sciences conference CFP', 'biology summit speakers'],
  chemistry: ['chemistry conference call for speakers', 'chemistry summit CFP'],
  physics: ['physics conference call for speakers', 'physics summit CFP'],
  space: ['space astronomy conference CFP', 'space industry speakers wanted'],
  'environmental science': ['environmental science conference CFP', 'environment summit speakers'],
  climate: ['climate conference call for speakers', 'climate summit CFP'],
  geology: ['geology earth science conference CFP', 'geoscience speakers wanted'],
  'marine science': ['marine science oceanography conference CFP', 'ocean science speakers'],

  // --- Healthcare & Wellness ---
  healthcare: ['healthcare conference speakers wanted', 'medical summit CFP'],
  nursing: ['nursing conference call for speakers', 'nursing summit CFP'],
  'public health': ['public health conference CFP', 'public health speakers wanted'],
  'mental health': ['mental health psychology conference CFP', 'mental health speakers'],
  pharmacy: ['pharmacy pharmaceutical conference CFP', 'pharmacy summit speakers'],
  dentistry: ['dentistry dental conference CFP', 'dental summit speakers'],
  wellness: ['wellness conference call for speakers', 'wellness summit CFP'],
  fitness: ['fitness industry conference CFP', 'fitness summit speakers'],
  nutrition: ['nutrition conference call for speakers', 'nutrition summit CFP'],

  // --- Finance & Economics ---
  finance: ['fintech conference call for speakers', 'finance summit CFP'],
  banking: ['banking conference call for speakers', 'banking summit CFP'],
  insurance: ['insurance conference CFP', 'insurtech speakers wanted'],
  accounting: ['accounting conference call for speakers', 'accounting summit CFP'],
  investment: ['investment wealth management conference CFP', 'investment summit speakers'],
  'real estate': ['proptech conference speakers', 'real estate summit CFP'],
  economics: ['economics conference call for speakers', 'economics summit CFP'],

  // --- Education ---
  education: ['education conference CFP', 'edtech speakers wanted'],
  'k-12 education': ['K-12 education conference CFP', 'K-12 teachers summit speakers'],
  'higher education': ['higher education university conference CFP', 'higher ed speakers'],
  edtech: ['edtech conference call for speakers', 'education technology CFP'],
  'online learning': ['online learning conference CFP', 'elearning summit speakers'],
  'special education': ['special education conference CFP', 'special ed speakers wanted'],
  'stem education': ['STEM education conference CFP', 'STEM teachers summit speakers'],

  // --- Government & Policy ---
  government: ['government conference call for speakers', 'govtech summit CFP'],
  'public policy': ['public policy conference CFP', 'policy summit speakers wanted'],
  nonprofit: ['nonprofit conference call for speakers', 'social impact summit CFP'],
  'social impact': ['social impact conference CFP', 'social good summit speakers'],
  'international relations': ['international relations conference CFP', 'foreign policy speakers'],
  defense: ['defense military conference CFP', 'defense summit speakers wanted'],

  // --- Engineering ---
  'civil engineering': ['civil engineering conference CFP', 'civil engineering speakers'],
  'mechanical engineering': ['mechanical engineering conference CFP', 'mechanical engineering speakers'],
  'electrical engineering': ['electrical engineering conference CFP', 'EE summit speakers'],
  aerospace: ['aerospace conference call for speakers', 'aerospace summit CFP'],
  automotive: ['automotive conference call for speakers', 'automotive summit CFP'],

  // --- Legal ---
  legal: ['legal tech conference CFP', 'law conference speakers'],
  compliance: ['compliance regulation conference CFP', 'compliance summit speakers'],
  'intellectual property': ['intellectual property conference CFP', 'IP law speakers wanted'],
  privacy: ['privacy data protection conference CFP', 'privacy summit speakers'],

  // --- Agriculture & Food ---
  agriculture: ['agtech conference CFP', 'agriculture summit speakers'],
  'food science': ['food science conference CFP', 'food industry speakers wanted'],
  sustainability: ['sustainability conference CFP', 'climate summit speakers'],
  agtech: ['agtech agriculture technology conference CFP', 'agtech speakers wanted'],

  // --- Transportation & Logistics ---
  aviation: ['aviation conference call for speakers', 'aviation summit CFP'],
  shipping: ['shipping logistics conference CFP', 'shipping industry speakers'],
  logistics: ['logistics conference call for speakers', 'logistics summit CFP'],
  'urban planning': ['urban planning conference CFP', 'smart cities speakers wanted'],
  'smart cities': ['smart cities conference CFP', 'smart cities summit speakers'],

  // --- Energy ---
  energy: ['energy conference speakers', 'renewable energy CFP'],
  'renewable energy': ['renewable energy clean tech conference CFP', 'renewables speakers'],
  'oil and gas': ['oil gas energy conference CFP', 'oil gas summit speakers'],
  'nuclear energy': ['nuclear energy conference CFP', 'nuclear summit speakers'],
  'clean tech': ['clean tech conference call for speakers', 'cleantech summit CFP'],

  // --- Sports & Recreation ---
  'sports management': ['sports management conference CFP', 'sports business speakers'],
  esports: ['esports conference call for speakers', 'esports summit CFP'],
  'event management': ['event management conference CFP', 'events industry speakers'],

  // --- Hospitality & Tourism ---
  hospitality: ['hospitality hotel conference CFP', 'hospitality summit speakers'],
  travel: ['travel tourism conference CFP', 'travel industry speakers wanted'],
  tourism: ['tourism conference call for speakers', 'tourism summit CFP'],
  restaurants: ['restaurant food service conference CFP', 'restaurant industry speakers'],
  'event planning': ['event planning conference CFP', 'event planning speakers wanted'],

  // --- Other ---
  retail: ['retail conference speakers', 'ecommerce summit CFP'],
  manufacturing: ['manufacturing conference CFP', 'industry 4.0 speakers'],
  telecom: ['telecom 5G conference CFP', 'telecom summit speakers'],
  environment: ['sustainability conference CFP', 'climate summit speakers'],
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

/**
 * Extract event date from content, being careful NOT to confuse
 * submission/proposal deadlines with the actual event date.
 * Deadline keywords: deadline, submit by, closes, due, proposals due
 * Event keywords: event date, conference date, takes place, held on, happening
 */
function extractEventDate(content: string): string | null {
  // Patterns that explicitly indicate the EVENT date (not a deadline)
  const eventPatterns = [
    /(?:event date|event dates|conference date|conference dates|takes place|held on|happening|will be held)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i,
    /(?:event date|conference date)[:\s]*(\w+ \d{1,2})\s*[-–]\s*(\w+ \d{1,2},?\s*\d{4})/i,
    /(?:event|conference|summit|symposium) (?:is |will be )?(?:on |from )?(\w+ \d{1,2})\s*[-–]\s*(\w+ \d{1,2},?\s*\d{4})/i,
  ];

  for (const pattern of eventPatterns) {
    const match = content.match(pattern);
    if (match) {
      const dateStr = match[2] || match[1];
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  // If we find date ranges (e.g., "May 4-6, 2026"), these are almost always event dates
  // But ONLY if not preceded by deadline-like keywords within 50 chars
  const dateRangePattern = /(\w+ \d{1,2})\s*[-–]\s*(\d{1,2},?\s*\d{4})/g;
  let rangeMatch;
  while ((rangeMatch = dateRangePattern.exec(content)) !== null) {
    const precedingText = content.substring(Math.max(0, rangeMatch.index - 60), rangeMatch.index).toLowerCase();
    const isDeadlineContext = /(?:deadline|submit|due|closes?|proposal|abstract)/.test(precedingText);
    if (!isDeadlineContext) {
      const parsed = new Date(`${rangeMatch[1]}, ${rangeMatch[2].replace(/^(\d{1,2})/, '')}`);
      // Try parsing the end date of the range
      const fullStr = `${rangeMatch[1].replace(/\d+$/, '')}${rangeMatch[2]}`;
      const parsed2 = new Date(fullStr);
      if (!isNaN(parsed2.getTime())) {
        return parsed2.toISOString();
      }
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return null;
}

function computeLiveQualityScore(meta: {
  cfpDeadline: string | null;
  eventDate: string | null;
  location: string | null;
  industries: string[];
  compensationType: string | null;
  description: string | null;
  matchesLocationFilter?: boolean;
}) {
  let score = 10;
  if (meta.cfpDeadline) score += 25;
  if (meta.eventDate) score += 20;
  if (meta.location) score += 10;
  if (meta.industries && meta.industries.length > 0) score += 10;
  if (meta.compensationType) score += 10;
  if (meta.description && meta.description.length > 120) score += 5;
  if (meta.matchesLocationFilter) score += 10;
  return Math.min(100, score);
}

// US state abbreviation to full name mapping for location extraction
const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington, DC',
};

// Well-known cities to help with extraction
const KNOWN_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
  'San Francisco', 'Seattle', 'Denver', 'Nashville', 'Washington', 'Boston',
  'Las Vegas', 'Portland', 'Atlanta', 'Miami', 'Minneapolis', 'Orlando',
  'Tampa', 'Charlotte', 'St. Louis', 'Pittsburgh', 'Cincinnati', 'Cleveland',
  'Kansas City', 'Indianapolis', 'Columbus', 'Salt Lake City', 'Raleigh',
  'Milwaukee', 'New Orleans', 'Detroit', 'Baltimore', 'Memphis', 'Sacramento',
  'London', 'Toronto', 'Vancouver', 'Berlin', 'Amsterdam', 'Paris', 'Sydney',
  'Melbourne', 'Singapore', 'Dubai', 'Tokyo', 'Barcelona', 'Dublin',
];

function extractLocation(content: string, title: string): string | null {
  const text = content + ' ' + title;

  // 1. "City, ST" pattern (e.g., "Los Angeles, CA" or "Nashville, TN")
  const cityStateMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/);
  if (cityStateMatch && US_STATES[cityStateMatch[2]]) {
    return `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
  }

  // 2. Explicit location labels
  const labelPatterns = [
    /(?:location|venue|where|held (?:in|at)|taking place (?:in|at))[:\s]+([A-Z][a-z]+(?:[\s,]+[A-Z][a-z]+){0,3}(?:,\s*[A-Z]{2})?)/,
    /(?:join us (?:in|at))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
  ];
  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (match) {
      const loc = match[1].trim();
      if (loc.length > 2 && loc.length < 60) return loc;
    }
  }

  // 3. Known city names in content
  for (const city of KNOWN_CITIES) {
    if (text.includes(city)) {
      // Try to get "City, ST" from nearby context
      const cityIdx = text.indexOf(city);
      const nearby = text.substring(cityIdx, cityIdx + city.length + 10);
      const withState = nearby.match(new RegExp(`${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s*([A-Z]{2})\\b`));
      if (withState && US_STATES[withState[1]]) {
        return `${city}, ${withState[1]}`;
      }
      return city;
    }
  }

  // 4. Country mentions
  const countryMatch = text.match(/\b(United States|United Kingdom|Canada|Australia|Germany|France|Singapore|Japan|India)\b/);
  if (countryMatch) return countryMatch[1];

  return null;
}

function extractDeadline(content: string): string | null {
  // Patterns with explicit deadline context keywords
  const deadlinePatterns = [
    // "deadline: January 15, 2026" or "deadline January 15, 2026"
    /(?:deadline|submit(?:ting)? by|closes?|due(?: date)?|proposals? due|abstracts? due|submissions? due|cfp closes?)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i,
    // "deadline: 2026-01-15"
    /(?:deadline|submit by|closes?|due|proposals? due)[:\s]*(\d{4}-\d{2}-\d{2})/i,
    // "deadline: 01/15/2026"
    /(?:deadline|submit by|closes?|due|proposals? due)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    // "January 15, 2026 deadline" (date before keyword)
    /(\w+ \d{1,2},?\s*\d{4})\s*(?:deadline|due date)/i,
    // "CFP closes January 11, 2026" with time info
    /(?:cfp|call for (?:speakers?|papers?|proposals?)) closes?[:\s]*\w+,?\s*(\w+ \d{1,2},?\s*\d{4})/i,
    // "Closes: Sunday, January 11, 2026" with day name
    /(?:deadline|closes?|due)[:\s]*(?:\w+day,?\s*)?(\w+ \d{1,2},?\s*\d{4})/i,
  ];

  for (const pattern of deadlinePatterns) {
    const match = content.match(pattern);
    if (match) {
      const day = parseHumanDate(match[1]);
      const thisYear = new Date().getUTCFullYear();
      if (day && day.getUTCFullYear() >= thisYear - 1 && day.getUTCFullYear() <= thisYear + 4) {
        // A snippet never states a zone: the day is read as Anywhere on Earth.
        return endOfCalendarDay(day)?.toISOString() ?? null;
      }
    }
  }

  return null;
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

  // Location extraction — improved with known cities and multiple pattern strategies
  const location = extractLocation(content, title);

  // Date extraction — improved with broader patterns
  const cfpDeadline = extractDeadline(content);

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
    'health': 'healthcare',
    'medical': 'healthcare',
    'patient safety': 'healthcare',
    'nursing': 'healthcare',
    'fintech': 'finance',
    'financial': 'finance',
    'blockchain': 'blockchain',
    'sustainability': 'sustainability',
    'human resources': 'hr',
    'education': 'education',
    'marketing': 'marketing',
    'construction': 'construction',
    'real estate': 'real estate',
    'legal': 'legal',
    'energy': 'energy',
    'manufacturing': 'manufacturing',
    'retail': 'retail',
    'hospitality': 'hospitality',
    'nonprofit': 'nonprofit',
    'government': 'government',
    'pharma': 'healthcare',
    'biotech': 'healthcare',
  };
  for (const [keyword, tag] of Object.entries(industryKeywords)) {
    if (lower.includes(keyword) && !industries.includes(tag)) {
      industries.push(tag);
    }
  }

  const compensation = extractCompensation(content);
  const eventDate = extractEventDate(content);

  return { format, isRemote, location, cfpDeadline, industries: normalizeIndustries(industries), eventDate, ...compensation };
}

export interface LiveSearchFilters {
  locations?: string[];
  isRemote?: boolean;
  format?: string[];
  compensationType?: string[];
}

/**
 * Check if content indicates the CFP is closed/expired.
 */
function isCfpClosed(content: string, title: string): boolean {
  const text = `${title} ${content}`.toLowerCase();
  const closedPatterns = [
    /\bcall for (speakers?|papers?|proposals?) (is |has )(now )?closed\b/,
    /\bcfp (is |has )?(now )?closed\b/,
    /\bsubmissions? (are|is|have) (now )?closed\b/,
    /\bno longer accepting (submissions?|proposals?|speakers?)\b/,
    /\bdeadline has passed\b/,
    /\bclosed for submissions?\b/,
    /\bapplication period has ended\b/,
    /\bwe are no longer accepting\b/,
    /\bhas closed\b/,
    /\bspeakers?.{0,20}closed\b/,
  ];
  return closedPatterns.some(p => p.test(text));
}

// Common abbreviation expansions for location matching
const locationAliasMap: Record<string, string[]> = {
  'ny': ['new york', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx'],
  'new york': ['ny', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx'],
  'la': ['los angeles', 'hollywood'],
  'los angeles': ['la', 'hollywood'],
  'sf': ['san francisco'],
  'san francisco': ['sf'],
  'dc': ['washington dc', 'washington d.c.', 'washington, dc'],
  'chicago': ['chi'],
  'boston': ['bos'],
  'philly': ['philadelphia'],
  'philadelphia': ['philly'],
};

/**
 * Build multiple search queries for broader coverage.
 * Returns 2-3 query variations to run in parallel.
 */
function buildSearchQueries(query: string, industries: string[], locations: string[]): string[] {
  const currentYear = new Date().getFullYear();
  const locationSuffix = locations.length > 0
    ? ` ${locations.join(' OR ')}`
    : '';

  const queries: string[] = [];

  if (query && industries.length > 0) {
    const industryTerms = industries.map((ind) => {
      const templates = INDUSTRY_QUERIES[ind.toLowerCase()];
      return templates ? templates[0] : `${ind} conference`;
    });
    queries.push(`${query} ${industryTerms[0]} speaking opportunity ${currentYear}${locationSuffix}`);
    queries.push(`${query} conference call for speakers ${currentYear}${locationSuffix}`);
    if (industryTerms.length > 1) {
      queries.push(`${query} ${industryTerms[1]} CFP ${currentYear}${locationSuffix}`);
    }
  } else if (query) {
    // Multiple query angles for broad coverage
    queries.push(`${query} conference call for speakers ${currentYear}${locationSuffix}`);
    queries.push(`${query} speaking opportunity CFP ${currentYear}${locationSuffix}`);
    queries.push(`${query} summit keynote speaker submissions ${currentYear}${locationSuffix}`);
  } else if (industries.length > 0) {
    const industryTerms = industries.map((ind) => {
      const templates = INDUSTRY_QUERIES[ind.toLowerCase()];
      return templates ? templates[0] : `${ind} conference`;
    });
    queries.push(`${industryTerms[0]} call for speakers ${currentYear}${locationSuffix}`);
    if (industryTerms.length > 1) {
      queries.push(`${industryTerms[1]} ${currentYear}${locationSuffix}`);
    }
    queries.push(`${industries[0]} conference CFP ${currentYear}${locationSuffix}`);
  }

  return queries;
}

/**
 * Perform a live web search for speaking opportunities using Linkup API.
 * Returns enriched results that match the Opportunity shape.
 */
export async function performLiveSearch(
  query: string,
  industries: string[],
  locations: string[] = [],
  filters: LiveSearchFilters = {}
): Promise<EnrichedLiveResult[]> {
  const apiKey = config.scrapers?.webSearch;

  const searchQueries = buildSearchQueries(query, industries, locations);

  if (searchQueries.length === 0) {
    return [];
  }

  if (!apiKey) {
    console.log('[LiveSearch] No WEB_SEARCH_API_KEY configured. Live search disabled.');
    return [];
  }

  console.log(`[LiveSearch] Running ${searchQueries.length} parallel queries:`, searchQueries);

  // Run all query variations in parallel. Each returns regex-tagged hits only;
  // no page is fetched and no Claude call is made before deduplication.
  const allResults = await Promise.all(
    searchQueries.map(sq => performLinkupSearch(sq, apiKey, industries))
  );

  // Deduplicate by URL across all query results
  const seenUrls = new Set<string>();
  let results: EnrichedLiveResult[] = [];
  for (const batch of allResults) {
    for (const r of batch) {
      if (!seenUrls.has(r.applyUrl)) {
        seenUrls.add(r.applyUrl);
        results.push(r);
      }
    }
  }

  // --- Cheap filtering before any enrichment ---

  // 1. Remove closed CFPs, past deadlines, and past events
  const now = new Date();
  results = results.filter(r => !isCfpClosed(r.description || '', r.title));
  results = results.filter(r => {
    if (!r.cfpDeadline) return true; // Keep results with unknown deadlines
    return new Date(r.cfpDeadline) >= now;
  });
  results = results.filter(r => {
    if (!r.eventDate) return true; // Keep results with unknown event dates
    return new Date(r.eventDate) >= now;
  });

  // 2. Relevance check — ensure result is actually about the search topic
  if (query) {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    results = results.filter(r => {
      const title = r.title.toLowerCase();
      const industries = r.industries.join(' ').toLowerCase();
      // Check title and industries first (strongest signal)
      const inTitleOrIndustries = queryTerms.some(term => title.includes(term) || industries.includes(term));
      if (inTitleOrIndustries) return true;
      // Check description but require the term as a standalone word (not "high-energy" for "energy")
      const desc = r.description || '';
      return queryTerms.some(term => {
        const wordBoundary = new RegExp(`\\b${term}\\b`, 'i');
        return wordBoundary.test(desc);
      });
    });
  }

  // --- Synchronous enrichment of the top hits only ---
  results.sort((a, b) => b.qualityScore - a.qualityScore);
  const toEnrich = results.slice(0, SYNC_ENRICH_LIMIT);
  if (toEnrich.length > 0) {
    console.log(`[LiveSearch] Enriching top ${toEnrich.length} of ${results.length} results from page content...`);
    await enrichResultsFromPages(toEnrich, industries);
  }

  // Persist every hit now; the enrichment cron finishes the ones not enriched here.
  try {
    const persisted = await persistLiveResults(results, now);
    console.log(`[LiveSearch] Persisted ${persisted.created} new results (${persisted.existing} already stored)`);
  } catch (error) {
    console.error('[LiveSearch] Failed to persist live results:', error);
  }

  // Enrichment may have found a closed call or a page that is not an opportunity.
  results = results.filter(r => !r.isClosed && r.isRelevant !== false);

  // Location filtering is now handled client-side via matchesLocationFilter flag

  // Recalculate quality scores with location match context
  if (locations.length > 0) {
    for (const r of results) {
      const matchesLoc = r.location ? locations.some(loc => {
        const lowerLoc = loc.toLowerCase();
        const resultLoc = r.location!.toLowerCase();
        if (resultLoc.includes(lowerLoc)) return true;
        const aliases = locationAliasMap[lowerLoc] || [];
        return aliases.some(alias => resultLoc.includes(alias));
      }) : false;

      r.matchesLocationFilter = matchesLoc;
      r.qualityScore = computeLiveQualityScore({
        cfpDeadline: r.cfpDeadline,
        eventDate: r.eventDate,
        location: r.location,
        industries: r.industries,
        compensationType: r.compensationType,
        description: r.description,
        matchesLocationFilter: matchesLoc,
      });
    }
  }

  // 3. Filter by remote preference
  if (filters.isRemote === true) {
    const remoteResults = results.filter(r => r.isRemote);
    if (remoteResults.length >= 3) {
      results = remoteResults;
    }
  }

  // 4. Filter by format
  if (filters.format && filters.format.length > 0) {
    const formatSet = new Set(filters.format.map(f => f.toLowerCase()));
    const formatResults = results.filter(r => formatSet.has(r.format.toLowerCase()));
    if (formatResults.length >= 2) {
      results = formatResults;
    }
  }

  // 5. Filter by compensation type
  if (filters.compensationType && filters.compensationType.length > 0) {
    const compSet = new Set(filters.compensationType.map(c => c.toLowerCase()));
    const compResults = results.filter(r =>
      r.compensationType && compSet.has(r.compensationType.toLowerCase())
    );
    if (compResults.length >= 2) {
      results = compResults;
    }
  }

  return results.sort((a, b) => b.qualityScore - a.qualityScore);
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

/**
 * Apply a Claude extraction to a live result. Claude read the actual page,
 * so its values overwrite the regex guesses; nulls keep what we had.
 * See mergeExtraction for the rules.
 */
export function applyExtractionToLiveResult(result: EnrichedLiveResult, extraction: ExtractionResult, now: Date = new Date()): void {
  const merged = mergeExtraction(liveResultToScraperResult(result), extraction, now);
  result.title = merged.title;
  result.organization = merged.organization;
  result.location = merged.location ?? null;
  result.isRemote = merged.isRemote;
  result.eventDate = merged.eventDate ? merged.eventDate.toISOString() : null;
  result.cfpDeadline = merged.cfpDeadline ? merged.cfpDeadline.toISOString() : null;
  result.deadlineTimezone = merged.cfpDeadline ? (merged.deadlineTimezone ?? null) : null;
  result.format = merged.format;
  result.industries = merged.industries;
  result.compensationType = merged.compensationType ?? null;
  result.compensationAmount = merged.compensationAmount ?? null;
  result.isClosed = merged.isClosed;
  result.isRelevant = merged.isRelevant;
  result.dateConfidence = merged.dateConfidence;
}

/**
 * Fetch result pages in parallel, then run one Claude extraction per result.
 * Falls back to regex extraction over the page text when Claude is unavailable.
 */
async function enrichResultsFromPages(
  results: EnrichedLiveResult[],
  searchIndustries: string[]
): Promise<void> {
  const FETCH_CONCURRENCY = SYNC_ENRICH_LIMIT;
  const pageTexts = await mapWithConcurrency(results, FETCH_CONCURRENCY, async (r) => {
    const page = await fetchPageText(r.applyUrl);
    if (!page.ok && page.reason === 'gone') r.isClosed = true;
    r.pageFetched = page.ok;
    return page.ok ? page.text : null;
  });

  const fetchedCount = pageTexts.filter(t => t !== null).length;
  console.log(`[LiveSearch] Page fetch: ${fetchedCount}/${results.length} pages returned content`);

  const indexesForClaude: number[] = [];
  for (let i = 0; i < results.length; i++) {
    const text = pageTexts[i] || results[i].description || '';
    if (text.length > 20 && !results[i].isClosed) indexesForClaude.push(i);
  }

  const extracted = new Set<number>();
  if (config.claude.apiKey && indexesForClaude.length > 0) {
    console.log(`[LiveSearch] Extracting metadata via Claude for ${indexesForClaude.length} results...`);
    const outcomes = await extractOpportunitiesBatch(
      indexesForClaude.map((i) => ({
        title: results[i].title,
        organization: results[i].organization,
        description: results[i].description,
        pageText: pageTexts[i],
        applyUrl: results[i].applyUrl,
      })),
      SYNC_ENRICH_LIMIT
    );
    outcomes.forEach((outcome, position) => {
      const index = indexesForClaude[position];
      if (outcome.status === 'ok') {
        applyExtractionToLiveResult(results[index], outcome.result);
        results[index].extracted = true;
        extracted.add(index);
      } else if (outcome.status === 'failed') {
        console.warn(`[LiveSearch] Extraction failed for ${results[index].applyUrl}: ${outcome.error}`);
      }
    });
    console.log(`[LiveSearch] Claude extracted metadata for ${extracted.size}/${indexesForClaude.length} results`);
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const pageText = pageTexts[i];

    if (!extracted.has(i) && pageText) {
      // Fallback: regex extraction from page text (only when Claude did not run)
      const pageMeta = extractMetadata(pageText, r.title, searchIndustries);
      if (!r.location && pageMeta.location) r.location = pageMeta.location;
      if (!r.cfpDeadline && pageMeta.cfpDeadline) r.cfpDeadline = pageMeta.cfpDeadline;
      if (!r.eventDate && pageMeta.eventDate) r.eventDate = pageMeta.eventDate;
      if (!r.compensationType && pageMeta.compensationType) {
        r.compensationType = pageMeta.compensationType;
        r.compensationAmount = pageMeta.compensationAmount;
        r.compensationDetails = pageMeta.compensationDetails;
      }
      if (!r.isRemote && pageMeta.isRemote) r.isRemote = true;
    }

    r.qualityScore = computeLiveQualityScore({
      cfpDeadline: r.cfpDeadline,
      eventDate: r.eventDate,
      location: r.location,
      industries: r.industries,
      compensationType: r.compensationType,
      description: r.description,
    });
  }
}

async function performLinkupSearch(
  query: string,
  apiKey: string,
  searchIndustries: string[]
): Promise<EnrichedLiveResult[]> {
  const results: EnrichedLiveResult[] = [];
  const seenUrls = new Set<string>();
  const now = new Date().toISOString();

  const maxPerPage = 50;
  // One page per variant keeps the request fast; variants run in parallel.
  const maxPages = 1;

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
        const errorText = await response.text();
        console.error('Linkup API error:', response.status, errorText);
        break;
      }

      const data = (await response.json()) as LinkupResponse;
      const searchResults = data.results || data.sources || [];

      for (const item of searchResults) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);

        const meta = extractMetadata(item.content || '', item.name || '', searchIndustries);

        results.push({
          id: `live-${randomUUID()}`,
          title: cleanTitle(decodeHtmlEntities(item.name || 'Untitled')),
          organization: extractOrganization(decodeHtmlEntities(item.name || ''), true),
          description: item.content ? decodeHtmlEntities(item.content) : null,
          location: meta.location,
          isRemote: meta.isRemote,
          eventDate: meta.eventDate,
          cfpDeadline: meta.cfpDeadline,
          format: meta.format,
          industries: meta.industries,
          compensationType: meta.compensationType,
          compensationAmount: meta.compensationAmount,
          compensationDetails: meta.compensationDetails,
          applyUrl: item.url,
          qualityScore: computeLiveQualityScore({
            cfpDeadline: meta.cfpDeadline,
            eventDate: meta.eventDate,
            location: meta.location,
            industries: meta.industries,
            compensationType: meta.compensationType,
            description: item.content || null,
          }),
          source: 'Live Search',
          sourceUrl: item.url,
          createdAt: now,
          updatedAt: now,
          isLiveResult: true,
          liveSearchUrl: item.url,
        });
      }

      if (searchResults.length < maxPerPage) {
        break;
      }
    }
  } catch (error) {
    console.error('Linkup search error:', error);
  }

  const filtered = results.filter(r => !isJunkResult({ title: r.title, description: r.description, applyUrl: r.applyUrl }));
  return filtered.sort((a, b) => b.qualityScore - a.qualityScore);
}

/**
 * Convert live search result to ScraperResult format for merging and persistence
 */
function liveResultToScraperResult(result: EnrichedLiveResult): ScraperResult {
  return {
    title: result.title,
    organization: result.organization,
    description: result.description || undefined,
    location: result.location,
    isRemote: result.isRemote,
    eventDate: result.eventDate ? new Date(result.eventDate) : undefined,
    cfpDeadline: result.cfpDeadline ? new Date(result.cfpDeadline) : undefined,
    deadlineTimezone: result.deadlineTimezone ?? null,
    format: result.format,
    industries: result.industries,
    compensationType: result.compensationType || undefined,
    compensationAmount: result.compensationAmount || undefined,
    compensationDetails: result.compensationDetails || undefined,
    applyUrl: result.applyUrl,
    source: 'Live Search',
    sourceUrl: result.sourceUrl,
    isClosed: result.isClosed,
    isRelevant: result.isRelevant,
  };
}

/**
 * Row data for a live hit. Hits enriched in the request are stored as
 * enriched (and verified when their page was fetched); the rest are stored
 * with no enrichment status so the cron worker picks them up.
 */
export function buildLiveCreateData(result: EnrichedLiveResult, now: Date = new Date()): Prisma.OpportunityCreateManyInput {
  const base = buildCreateData(liveResultToScraperResult(result));
  const extracted = result.extracted === true;
  return {
    ...base,
    isClosed: result.isClosed === true,
    isRelevant: result.isRelevant !== false,
    dateConfidence: serializeDateConfidence(result.dateConfidence),
    enrichmentStatus: extracted ? 'enriched' : null,
    enrichedAt: extracted ? now : null,
    verifiedAt: extracted && result.pageFetched ? now : null,
  };
}

/**
 * Store live hits that are not already in the database. Existing rows are
 * left alone: enrichment and verification keep them current.
 */
export async function persistLiveResults(
  results: EnrichedLiveResult[],
  now: Date = new Date()
): Promise<{ created: number; existing: number }> {
  if (results.length === 0) return { created: 0, existing: 0 };

  const urls = results.map((r) => r.applyUrl);
  const existingRows = await prisma.opportunity.findMany({
    where: { applyUrl: { in: urls } },
    select: { applyUrl: true },
  });
  const existingUrls = new Set(existingRows.map((row) => row.applyUrl));
  const fresh = results.filter((r) => !existingUrls.has(r.applyUrl));
  if (fresh.length === 0) return { created: 0, existing: existingUrls.size };

  const data = fresh.map((r) => buildLiveCreateData(r, now));
  let created = 0;
  try {
    created = (await prisma.opportunity.createMany({ data })).count;
  } catch (error) {
    // A concurrent search may have inserted one of these URLs; fall back to row-by-row.
    console.warn('[LiveSearch] createMany failed, inserting individually:', error instanceof Error ? error.message : error);
    for (const row of data) {
      try {
        await prisma.opportunity.create({ data: row });
        created++;
      } catch {
        // already stored
      }
    }
  }
  if (created > 0) {
    // Inside the request on purpose: nothing runs after the response on Vercel.
    const stored = await prisma.opportunity.findMany({
      where: { applyUrl: { in: fresh.map((r) => r.applyUrl) }, eventId: null },
      select: { id: true, title: true, organization: true, applyUrl: true, eventDate: true, location: true, eventId: true },
    });
    await assignEvents(prisma, stored, now);
  }
  return { created, existing: existingUrls.size };
}
