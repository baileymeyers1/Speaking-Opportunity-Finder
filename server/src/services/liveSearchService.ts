import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { enrichOpportunitiesBatch } from './enrichmentService.js';
import { cleanTitle, extractOrganization, normalizeIndustries, decodeHtmlEntities, isJunkResult } from './dataNormalization.js';
import type { ScraperResult } from '../scrapers/index.js';

const prisma = new PrismaClient();

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
  qualityScore: number;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  isLiveResult: boolean;
  liveSearchUrl: string;
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
      const dateStr = rangeMatch[2] || rangeMatch[1];
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
}) {
  let score = 20;
  if (meta.cfpDeadline) score += 20;
  if (meta.eventDate) score += 15;
  if (meta.location) score += 10;
  if (meta.industries && meta.industries.length > 0) score += 10;
  if (meta.compensationType) score += 10;
  if (meta.description && meta.description.length > 120) score += 10;
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
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2024 && parsed.getFullYear() <= 2030) {
        return parsed.toISOString();
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
    /\bcall for (speakers?|papers?|proposals?) is (now )?closed\b/,
    /\bcfp (is )?(now )?closed\b/,
    /\bsubmissions? (are|is) (now )?closed\b/,
    /\bno longer accepting (submissions?|proposals?|speakers?)\b/,
    /\bdeadline has passed\b/,
    /\bclosed for submissions?\b/,
    /\bapplication period has ended\b/,
    /\bwe are no longer accepting\b/,
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
 * Check if a location string matches any of the user's requested locations.
 * Handles city names, state abbreviations, and partial matches.
 */
function locationMatches(resultLocation: string | null, content: string, title: string, requestedLocations: string[]): boolean {
  if (requestedLocations.length === 0) return true;

  const searchText = `${title} ${content} ${resultLocation || ''}`.toLowerCase();
  const lowerLocations = requestedLocations.map(l => l.toLowerCase());

  for (const loc of lowerLocations) {
    // Direct match
    if (searchText.includes(loc)) return true;

    // Check aliases
    const aliases = locationAliasMap[loc] || [];
    if (aliases.some(alias => searchText.includes(alias))) return true;
  }

  return false;
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
  const currentYear = new Date().getFullYear();

  const locationSuffix = locations.length > 0
    ? ` ${locations.join(' OR ')}`
    : '';

  let searchQuery = '';
  if (query && industries.length > 0) {
    const industryTerms = industries.map((ind) => {
      const templates = INDUSTRY_QUERIES[ind.toLowerCase()];
      return templates ? templates[0] : `${ind} conference`;
    });
    searchQuery = `"${query}" ${industryTerms.join(' OR ')} speaking opportunity CFP ${currentYear}${locationSuffix}`;
  } else if (query) {
    searchQuery = `"${query}" speaking opportunity OR call for speakers OR CFP ${currentYear}${locationSuffix}`;
  } else if (industries.length > 0) {
    const industryTerms = industries.map((ind) => {
      const templates = INDUSTRY_QUERIES[ind.toLowerCase()];
      return templates ? templates[0] : `${ind} conference`;
    });
    searchQuery = `(${industryTerms.join(' OR ')}) call for speakers ${currentYear}${locationSuffix}`;
  }

  if (!searchQuery) {
    return [];
  }

  if (!apiKey) {
    console.log('[LiveSearch] No WEB_SEARCH_API_KEY configured. Live search disabled.');
    return [];
  }

  let results = await performLinkupSearch(searchQuery, apiKey, industries);

  // --- Post-fetch filtering ---

  // 1. Remove closed CFPs and past deadlines
  const now = new Date();
  results = results.filter(r => !isCfpClosed(r.description || '', r.title));
  results = results.filter(r => {
    if (!r.cfpDeadline) return true; // Keep results with unknown deadlines
    return new Date(r.cfpDeadline) >= now;
  });

  // 2. Filter by location — use Claude-extracted location as source of truth
  if (locations.length > 0) {
    const matched = results.filter(r => {
      // Only trust the structured location field (set by Claude or regex)
      if (!r.location) return false;
      const resultLoc = r.location.toLowerCase();
      return locations.some(loc => {
        const lowerLoc = loc.toLowerCase();
        // Direct match
        if (resultLoc.includes(lowerLoc)) return true;
        // Check aliases
        const aliases = locationAliasMap[lowerLoc] || [];
        return aliases.some(alias => resultLoc.includes(alias));
      });
    });

    if (matched.length >= 3) {
      results = matched;
    } else {
      // Not enough location matches — keep matched first, then fill with
      // results that have no location (benefit of the doubt), then others
      const noLocation = results.filter(r => !r.location && !matched.includes(r));
      const unmatched = results.filter(r => r.location && !matched.includes(r));
      results = [...matched, ...noLocation.slice(0, 4), ...unmatched.slice(0, Math.max(0, 8 - matched.length - noLocation.length))];
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

  return results;
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
 * Fetch a page's text content with a short timeout.
 * Returns just the visible text (strips HTML tags).
 */
async function fetchPageText(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpeakingFinderBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;
    }

    const html = await response.text();

    // Strip HTML to get visible text — lightweight extraction
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Return first 5000 chars — enough for metadata extraction
    return text.substring(0, 5000);
  } catch {
    return null;
  }
}

/**
 * Use Claude to extract structured metadata from scraped page content in a single batch call.
 * Much more accurate than regex for dates, locations, and deadline detection.
 */
async function extractMetadataWithClaude(
  items: { index: number; title: string; pageText: string }[]
): Promise<Map<number, {
  eventDate?: string;
  cfpDeadline?: string;
  location?: string;
  isRemote?: boolean;
  isClosed?: boolean;
  compensationType?: string;
  format?: string;
  industries?: string[];
}>> {
  const resultMap = new Map<number, any>();

  if (!config.claude.apiKey || items.length === 0) return resultMap;

  // Build a compact prompt — with batches of ~5, each item gets plenty of text
  const charsPerItem = Math.min(2000, Math.floor(12000 / items.length));
  const itemDescriptions = items.map(item =>
    `[${item.index}] "${item.title}"\n${item.pageText.substring(0, charsPerItem)}`
  ).join('\n---\n');

  const prompt = `Extract metadata from these speaking opportunity pages. Return ONLY a JSON array, no other text.

For EACH item, extract:
- eventDate: when the event/conference takes place (YYYY-MM-DD). Use start date if range. This is NOT the submission deadline.
- cfpDeadline: when speaker proposals/submissions are due (YYYY-MM-DD). This is NOT the event date.
- location: "City, ST" or "City, Country". null if not found.
- isRemote: true if virtual/online/remote option exists
- isClosed: true if the call for speakers/proposals is closed or deadline has passed
- compensationType: "paid"|"travel"|"honorarium"|"exposure" or null
- format: "conference"|"podcast"|"webinar"|"workshop"|"meetup"|"panel"
- industries: up to 3 relevant industry tags

IMPORTANT: Distinguish submission deadlines from event dates. "Proposals due Sept 21" is cfpDeadline, "Conference May 4-6" is eventDate.

Items:
${itemDescriptions}

Return format: [{"index":0,"eventDate":"2026-05-04","cfpDeadline":"2025-09-21","location":"Boston, MA","isRemote":false,"isClosed":false,"compensationType":"travel","format":"conference","industries":["healthcare","marketing"]}, ...]`;

  try {
    const client = new Anthropic({ apiKey: config.claude.apiKey });
    const message = await client.messages.create({
      model: config.claude.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return resultMap;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return resultMap;

    for (const item of parsed) {
      if (item.index !== undefined) {
        resultMap.set(item.index, {
          eventDate: item.eventDate && item.eventDate !== 'null' ? item.eventDate : undefined,
          cfpDeadline: item.cfpDeadline && item.cfpDeadline !== 'null' ? item.cfpDeadline : undefined,
          location: item.location && item.location !== 'null' ? item.location : undefined,
          isRemote: item.isRemote,
          isClosed: item.isClosed,
          compensationType: item.compensationType && item.compensationType !== 'null' ? item.compensationType : undefined,
          format: item.format,
          industries: Array.isArray(item.industries) ? item.industries : undefined,
        });
      }
    }
  } catch (error) {
    console.error('[LiveSearch] Claude metadata extraction failed:', error);
  }

  return resultMap;
}

/**
 * Merge Claude-extracted metadata into a live result.
 * Claude data OVERWRITES regex-extracted data (not just fills gaps),
 * because Claude reads the actual page content and is more accurate.
 * Only skips overwrite when Claude returns undefined/null for a field.
 */
export function mergeClaudeMetadata(
  result: EnrichedLiveResult,
  claude: {
    eventDate?: string;
    cfpDeadline?: string;
    location?: string;
    isRemote?: boolean;
    isClosed?: boolean;
    compensationType?: string;
    format?: string;
    industries?: string[];
  }
): void {
  if (claude.eventDate && claude.eventDate !== 'null') {
    const d = new Date(claude.eventDate);
    if (!isNaN(d.getTime())) result.eventDate = d.toISOString();
  }
  if (claude.cfpDeadline && claude.cfpDeadline !== 'null') {
    const d = new Date(claude.cfpDeadline);
    if (!isNaN(d.getTime())) result.cfpDeadline = d.toISOString();
  }
  if (claude.location && claude.location !== 'null') {
    result.location = claude.location;
  }
  if (claude.isRemote !== undefined) {
    result.isRemote = claude.isRemote;
  }
  if (claude.compensationType && claude.compensationType !== 'null') {
    result.compensationType = claude.compensationType;
  }
  if (claude.format && claude.format !== 'null') {
    result.format = claude.format;
  }
  if (claude.industries && claude.industries.length > 0) {
    result.industries = normalizeIndustries(claude.industries);
  }
  if (claude.isClosed) {
    if (!result.cfpDeadline) {
      result.cfpDeadline = new Date('2020-01-01').toISOString();
    }
  }
}

/**
 * Scrape result pages in parallel, then use Claude to extract metadata.
 * Falls back to regex extraction if Claude is unavailable.
 */
async function enrichResultsFromPages(
  results: EnrichedLiveResult[],
  searchIndustries: string[]
): Promise<void> {
  // Fetch all pages in parallel with a concurrency limit
  const CONCURRENCY = 6;
  const pageTexts: (string | null)[] = new Array(results.length).fill(null);

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    const batch = results.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(
      batch.map(r => fetchPageText(r.applyUrl))
    );
    for (let j = 0; j < fetched.length; j++) {
      pageTexts[i + j] = fetched[j];
    }
  }

  // Collect ALL items for Claude — use page text if available, otherwise use snippet
  const itemsForClaude: { index: number; title: string; pageText: string }[] = [];
  for (let i = 0; i < results.length; i++) {
    const text = pageTexts[i] || results[i].description || '';
    if (text.length > 20) {
      itemsForClaude.push({ index: i, title: results[i].title, pageText: text });
    }
  }

  // Split into batches of 5 and run in parallel — ensures enough text per item
  const CLAUDE_BATCH_SIZE = 5;
  let claudeResults = new Map<number, any>();
  if (config.claude.apiKey && itemsForClaude.length > 0) {
    console.log(`[LiveSearch] Extracting metadata via Claude for ${itemsForClaude.length} results in batches of ${CLAUDE_BATCH_SIZE}...`);

    const batches: { index: number; title: string; pageText: string }[][] = [];
    for (let i = 0; i < itemsForClaude.length; i += CLAUDE_BATCH_SIZE) {
      batches.push(itemsForClaude.slice(i, i + CLAUDE_BATCH_SIZE));
    }

    // Run all batches in parallel
    const batchResults = await Promise.all(
      batches.map(batch => extractMetadataWithClaude(batch))
    );

    // Merge all batch results into one map
    for (const batchMap of batchResults) {
      for (const [key, value] of batchMap) {
        claudeResults.set(key, value);
      }
    }

    console.log(`[LiveSearch] Claude extracted metadata for ${claudeResults.size}/${itemsForClaude.length} results`);
  }

  // Apply extracted metadata to results — Claude overwrites regex data
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const claudeMeta = claudeResults.get(i);
    const pageText = pageTexts[i];

    if (claudeMeta) {
      mergeClaudeMetadata(r, claudeMeta);
    } else if (pageText) {
      // Fallback: regex extraction from page text (only when Claude failed)
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

    // Recalculate quality score with enriched data
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
  const maxPages = 5;

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

  // Cap results before expensive enrichment — we only display ~10-15 anyway
  const toEnrich = filtered.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 12);

  // Scrape actual pages to fill in missing metadata (dates, locations, etc.)
  console.log(`[LiveSearch] Enriching ${toEnrich.length} results from page content...`);
  await enrichResultsFromPages(toEnrich, searchIndustries);

  return toEnrich.sort((a, b) => b.qualityScore - a.qualityScore);
}

/**
 * Convert live search result to ScraperResult format for enrichment and persistence
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
    format: result.format,
    industries: result.industries,
    compensationType: result.compensationType || undefined,
    compensationAmount: result.compensationAmount || undefined,
    compensationDetails: result.compensationDetails || undefined,
    applyUrl: result.applyUrl,
    qualityScore: result.qualityScore,
    source: `Live Search - ${result.industries.join(', ') || 'general'}`,
    sourceUrl: result.sourceUrl,
  };
}

/**
 * Auto-save live search results to the database after enrichment
 */
export async function autoSaveLiveResults(
  liveResults: EnrichedLiveResult[]
): Promise<{ saved: number; updated: number; skipped: number }> {
  let saved = 0;
  let updated = 0;
  let skipped = 0;

  if (liveResults.length === 0) {
    return { saved, updated, skipped };
  }

  console.log(`Auto-saving ${liveResults.length} live search results...`);

  // Convert to ScraperResult format
  const scraperResults = liveResults.map(liveResultToScraperResult);

  // Enrich with Claude API if configured
  let enrichedResults = scraperResults;
  if (config.claude.apiKey) {
    console.log('Enriching live results with Claude API...');
    enrichedResults = await enrichOpportunitiesBatch(scraperResults, 3);
  }

  // Save to database
  for (const result of enrichedResults) {
    try {
      const existing = await prisma.opportunity.findFirst({
        where: { applyUrl: result.applyUrl },
      });

      const data = {
        title: result.title,
        organization: result.organization,
        description: result.description || null,
        location: result.location || null,
        isRemote: result.isRemote,
        eventDate: result.eventDate || null,
        cfpDeadline: result.cfpDeadline || null,
        format: result.format,
        industries: JSON.stringify(result.industries),
        compensationType: result.compensationType || null,
        compensationAmount: result.compensationAmount || null,
        compensationDetails: result.compensationDetails || null,
        applyUrl: result.applyUrl,
        qualityScore: result.qualityScore,
        source: result.source,
        sourceUrl: result.sourceUrl || null,
        enrichmentStatus: (result as any).enrichmentStatus || null,
        enrichedAt: (result as any).enrichedAt || null,
        enrichmentError: (result as any).enrichmentError || null,
      };

      if (existing) {
        // Update existing opportunity with better data
        await prisma.opportunity.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        // Create new opportunity
        await prisma.opportunity.create({ data });
        saved++;
      }
    } catch (error) {
      console.error(`Failed to save live result: ${result.title}`, error);
      skipped++;
    }
  }

  console.log(
    `Auto-save complete: ${saved} new, ${updated} updated, ${skipped} skipped`
  );

  return { saved, updated, skipped };
}
