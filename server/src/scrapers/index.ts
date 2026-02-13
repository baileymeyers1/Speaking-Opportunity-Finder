import { PrismaClient } from '@prisma/client';
import { scrapeConfsTech } from './confstech.js';
import { scrapeJavaConferences } from './javaconferences.js';
import { scrapeCallingAllPapers } from './callingallpapers.js';
import { scrapeLinkupCFPs } from './linkupcfp.js';
import { scrapeSessionize } from './sessionize.js';
import { scrapePaperCall } from './papercall.js';
import { scrapeWikiCFP } from './wikicfp.js';
import { scrapeUsMegaEvents } from './usMegaEvents.js';
import { scrapeConferenceAlertsUSA } from './conferenceAlerts.js';
import { scrapeDevelopersEvents } from './developersEvents.js';
import { scrapeAirtableEvents } from './airtableEvents.js';
import { scrapeEventbrite } from './eventbrite.js';
import { scrapeLinkedInEvents } from './linkedinEvents.js';
import { scrapePacEvents } from './pacEvents.js';
import { scrapePrNewsOnline } from './prNewsOnline.js';
import { config } from '../config/index.js';

const prisma = new PrismaClient();

export interface ScraperResult {
  title: string;
  organization: string;
  description?: string;
  location?: string | null;
  isRemote: boolean;
  eventDate?: Date;
  cfpDeadline?: Date;
  format: string;
  industries: string[];
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
  applyUrl: string;
  qualityScore?: number;
  source: string;
  sourceUrl?: string | null;
}

function computeQualityScore(result: ScraperResult): number {
  let score = 20;

  if (result.cfpDeadline) score += 20;
  if (result.eventDate) score += 15;
  if (result.location) score += 10;
  if (result.industries && result.industries.length > 0) score += 10;
  if (result.compensationType || result.compensationAmount) score += 10;
  if (result.description && result.description.length > 120) score += 10;

  const sourceBoost = [
    'sessionize.com',
    'papercall.io',
    'confs.tech',
    'javaconferences.org',
    'callingallpapers.com',
    'wikicfp.com',
  ];
  if (sourceBoost.includes(result.source)) score += 5;

  return Math.min(100, score);
}

async function backfillQualityScores(): Promise<number> {
  const batchSize = 200;
  let updated = 0;

  while (true) {
    const batch = await prisma.opportunity.findMany({
      where: { qualityScore: null },
      take: batchSize,
    });

    if (batch.length === 0) break;

    for (const opp of batch) {
      const computed = computeQualityScore({
        title: opp.title,
        organization: opp.organization,
        description: opp.description || undefined,
        location: opp.location,
        isRemote: opp.isRemote,
        eventDate: opp.eventDate || undefined,
        cfpDeadline: opp.cfpDeadline || undefined,
        format: opp.format,
        industries: (() => {
          try {
            return JSON.parse(opp.industries) as string[];
          } catch {
            return [];
          }
        })(),
        compensationType: opp.compensationType || undefined,
        compensationAmount: opp.compensationAmount || undefined,
        compensationDetails: opp.compensationDetails || undefined,
        applyUrl: opp.applyUrl,
        source: opp.source,
        sourceUrl: opp.sourceUrl || undefined,
      });

      await prisma.opportunity.update({
        where: { id: opp.id },
        data: { qualityScore: computed },
      });
      updated++;
    }
  }

  return updated;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip trailing slash, www prefix, and common tracking params
    let normalized = `${u.protocol}//${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`;
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

function inferCompensation(description?: string) {
  if (!description) return {};
  const lower = description.toLowerCase();
  let compensationType: string | undefined;

  if (/\bhonorarium\b/.test(lower)) compensationType = 'honorarium';
  else if (/\bpaid\b/.test(lower)) compensationType = 'paid';
  else if (/\btravel\b/.test(lower)) compensationType = 'travel';
  else if (/\bstipend\b/.test(lower)) compensationType = 'paid';
  else if (/\bexposure\b/.test(lower)) compensationType = 'exposure';

  const amountMatch = description.match(/\$[\s]*([0-9]{2,6}(?:,[0-9]{3})?)/);
  const compensationAmount = amountMatch
    ? parseInt(amountMatch[1].replace(/,/g, ''), 10)
    : undefined;

  const compensationDetails = compensationType ? description.substring(0, 300) : undefined;

  return { compensationType, compensationAmount, compensationDetails };
}

function deduplicateResults(results: ScraperResult[]): ScraperResult[] {
  const seen = new Set<string>();
  const deduped: ScraperResult[] = [];

  for (const result of results) {
    const key = normalizeUrl(result.applyUrl);
    if (!seen.has(key)) {
      deduped.push(result);
      seen.add(key);
    }
  }

  return deduped;
}

/**
 * Daily scrapers: fast, structured data sources.
 * Runs every 24 hours.
 */
export async function runDailyScrapers(): Promise<ScraperResult[]> {
  console.log('Running daily scrapers...');

  const [confsTechResults, javaResults, callingAllPapersResults] = await Promise.all([
    scrapeConfsTech(),
    scrapeJavaConferences(),
    scrapeCallingAllPapers(),
  ]);

  const results = deduplicateResults([
    ...confsTechResults,
    ...javaResults,
    ...callingAllPapersResults,
  ]);

  console.log(`Daily scrapers found ${results.length} opportunities`);
  return results;
}

/**
 * Weekly scrapers: slower web searches and scraping sources.
 * Runs once per week to expand the database with cross-industry data.
 */
export async function runWeeklyScrapers(): Promise<ScraperResult[]> {
  console.log('Running weekly deep scrapers...');

  // Run API-based scrapers in parallel
  const [sessionizeResults, paperCallResults, wikiCFPResults] = await Promise.all([
    scrapeSessionize(),
    scrapePaperCall(),
    scrapeWikiCFP(),
  ]);

  // Run Linkup sequentially (rate limited)
  const linkupResults = await scrapeLinkupCFPs(config.scrapers?.webSearch);
  const megaEventResults = await scrapeUsMegaEvents();

  const [
    conferenceAlertsResults,
    developersEventsResults,
    airtableResults,
    eventbriteResults,
    linkedinResults,
    pacResults,
    prNewsResults,
  ] = await Promise.all([
    scrapeConferenceAlertsUSA(),
    scrapeDevelopersEvents(),
    scrapeAirtableEvents(),
    scrapeEventbrite(),
    scrapeLinkedInEvents(),
    scrapePacEvents(),
    scrapePrNewsOnline(),
  ]);

  const results = deduplicateResults([
    ...sessionizeResults,
    ...paperCallResults,
    ...wikiCFPResults,
    ...linkupResults,
    ...megaEventResults,
    ...conferenceAlertsResults,
    ...developersEventsResults,
    ...airtableResults,
    ...eventbriteResults,
    ...linkedinResults,
    ...pacResults,
    ...prNewsResults,
  ]);

  console.log(`Weekly scrapers found ${results.length} opportunities`);
  return results;
}

/**
 * Run all scrapers (used for full sync or initial population).
 */
export async function runAllScrapers(): Promise<ScraperResult[]> {
  const dailyResults = await runDailyScrapers();
  const weeklyResults = await runWeeklyScrapers();
  return deduplicateResults([...dailyResults, ...weeklyResults]);
}

async function persistResults(results: ScraperResult[]): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;

  for (const result of results) {
    try {
      const existing = await prisma.opportunity.findFirst({
        where: { applyUrl: result.applyUrl },
      });

      const inferredComp = inferCompensation(result.description);
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
        compensationType: result.compensationType || inferredComp.compensationType || null,
        compensationAmount: result.compensationAmount || inferredComp.compensationAmount || null,
        compensationDetails: result.compensationDetails || inferredComp.compensationDetails || null,
        applyUrl: result.applyUrl,
        qualityScore: result.qualityScore ?? computeQualityScore(result),
        source: result.source,
        sourceUrl: result.sourceUrl || null,
        enrichmentStatus: (result as any).enrichmentStatus || null,
        enrichedAt: (result as any).enrichedAt || null,
        enrichmentError: (result as any).enrichmentError || null,
      };

      if (existing) {
        await prisma.opportunity.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        await prisma.opportunity.create({ data });
        added++;
      }
    } catch (error) {
      console.error(`Error saving opportunity: ${result.title}`, error);
    }
  }

  return { added, updated };
}

async function cleanupExpired(): Promise<number> {
  const expiredDate = new Date();

  const deleted = await prisma.opportunity.deleteMany({
    where: {
      cfpDeadline: {
        lt: expiredDate,
      },
      source: {
        not: 'Live Search',
      },
    },
  });

  return deleted.count;
}

async function cleanupPlaceholderData(): Promise<number> {
  const deleted = await prisma.opportunity.deleteMany({
    where: {
      applyUrl: {
        contains: 'example.com',
      },
    },
  });
  if (deleted.count > 0) {
    console.log(`Cleaned up ${deleted.count} placeholder records with example.com URLs`);
  }
  return deleted.count;
}

/**
 * Sync opportunities to the database.
 * @param mode - 'daily' runs fast scrapers only, 'weekly' runs deep scrapers, 'full' runs all
 */
export async function syncOpportunities(
  mode: 'daily' | 'weekly' | 'full' = 'full'
): Promise<{
  added: number;
  updated: number;
  total: number;
  mode: string;
}> {
  console.log(`Starting ${mode} opportunity sync...`);

  // Clean up placeholder data with example.com URLs
  await cleanupPlaceholderData();

  let results: ScraperResult[];
  switch (mode) {
    case 'daily':
      results = await runDailyScrapers();
      break;
    case 'weekly':
      results = await runWeeklyScrapers();
      break;
    case 'full':
    default:
      results = await runAllScrapers();
      break;
  }

  // Enrichment is handled by the background enrichment service
  // to avoid expensive batch API calls during sync

  const { added, updated } = await persistResults(results);
  const deletedCount = await cleanupExpired();
  const backfilled = await backfillQualityScores();

  console.log(
    `Sync complete (${mode}): ${added} added, ${updated} updated, ${deletedCount} expired removed, ${backfilled} quality backfilled`
  );

  const total = await prisma.opportunity.count();
  return { added, updated, total, mode };
}
