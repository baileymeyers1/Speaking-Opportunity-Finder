import { PrismaClient } from '@prisma/client';
import { scrapeConfsTech } from './confstech.js';
import { scrapeJavaConferences } from './javaconferences.js';
import { scrapeCallingAllPapers } from './callingallpapers.js';
import { scrapeLinkupCFPs } from './linkupcfp.js';
import { scrapeSessionize } from './sessionize.js';
import { scrapePaperCall } from './papercall.js';
import { scrapeWikiCFP } from './wikicfp.js';
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
  source: string;
  sourceUrl?: string | null;
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

  const results = deduplicateResults([
    ...sessionizeResults,
    ...paperCallResults,
    ...wikiCFPResults,
    ...linkupResults,
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
        source: result.source,
        sourceUrl: result.sourceUrl || null,
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
        notIn: ['manual', 'Live Search'],
      },
    },
  });

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

  const { added, updated } = await persistResults(results);
  const deletedCount = await cleanupExpired();

  console.log(
    `Sync complete (${mode}): ${added} added, ${updated} updated, ${deletedCount} expired removed`
  );

  const total = await prisma.opportunity.count();
  return { added, updated, total, mode };
}
