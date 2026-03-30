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

function extractEventDate(content: string): string | null {
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
  const eventDate = extractEventDate(content);

  return { format, isRemote, location, cfpDeadline, industries: normalizeIndustries(industries), eventDate, ...compensation };
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
  if (query && industries.length > 0) {
    const industryTerms = industries.map((ind) => {
      const templates = INDUSTRY_QUERIES[ind.toLowerCase()];
      return templates ? templates[0] : `${ind} conference`;
    });
    searchQuery = `"${query}" ${industryTerms.join(' OR ')} speaking opportunity CFP ${currentYear}`;
  } else if (query) {
    searchQuery = `"${query}" speaking opportunity OR call for speakers OR CFP ${currentYear}`;
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

  if (!apiKey) {
    console.log('[LiveSearch] No WEB_SEARCH_API_KEY configured. Live search disabled.');
    return [];
  }

  return await performLinkupSearch(searchQuery, apiKey, industries);
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
  return filtered.sort((a, b) => b.qualityScore - a.qualityScore);
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
