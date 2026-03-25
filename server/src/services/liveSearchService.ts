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
