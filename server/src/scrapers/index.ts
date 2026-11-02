import { PrismaClient } from '@prisma/client';
import { scrapeConfsTech } from './confstech.js';
import { scrapeJavaConferences } from './javaconferences.js';
import { scrapeCallingAllPapers } from './callingallpapers.js';
import { scrapeLinkupCFPs } from './linkupcfp.js';
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
import { generateDeduplicationKey } from '../services/deduplicationService.js';
import { decodeHtmlEntities, isJunkResult } from '../services/dataNormalization.js';
import { computeQualityScore, type ScraperResult } from './qualityScore.js';
import { buildCreateData, buildUpdateData } from './persistData.js';

const prisma = new PrismaClient();

export { computeQualityScore } from './qualityScore.js';
export type { ScraperResult } from './qualityScore.js';

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

export async function recalculateAllQualityScores(): Promise<number> {
  const batchSize = 200;
  let updated = 0;
  let skip = 0;

  while (true) {
    const batch = await prisma.opportunity.findMany({
      take: batchSize,
      skip,
    });

    if (batch.length === 0) break;

    for (const opp of batch) {
      const result: ScraperResult = {
        title: opp.title,
        organization: opp.organization,
        description: opp.description || undefined,
        location: opp.location || undefined,
        isRemote: opp.isRemote,
        eventDate: opp.eventDate ? new Date(opp.eventDate) : undefined,
        cfpDeadline: opp.cfpDeadline ? new Date(opp.cfpDeadline) : undefined,
        format: opp.format,
        industries: (() => { try { return JSON.parse(opp.industries || '[]'); } catch { return []; } })(),
        compensationType: opp.compensationType || undefined,
        compensationAmount: opp.compensationAmount || undefined,
        applyUrl: opp.applyUrl,
        source: opp.source,
        isClosed: opp.isClosed,
        isRelevant: opp.isRelevant,
      };

      const newScore = computeQualityScore(result);
      if (newScore !== opp.qualityScore) {
        await prisma.opportunity.update({
          where: { id: opp.id },
          data: { qualityScore: newScore },
        });
        updated++;
      }
    }

    skip += batchSize;
  }

  console.log(`Recalculated quality scores: ${updated} records updated`);
  return updated;
}

export function normalizeUrl(url: string): string {
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
  const [paperCallResults, wikiCFPResults] = await Promise.all([
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
      // Decode HTML entities before any processing
      result.title = decodeHtmlEntities(result.title);
      result.organization = decodeHtmlEntities(result.organization);
      if (result.description) {
        result.description = decodeHtmlEntities(result.description);
      }

      // Skip junk results
      if (isJunkResult({ title: result.title, description: result.description, applyUrl: result.applyUrl })) {
        continue;
      }

      const existing = await prisma.opportunity.findFirst({
        where: { applyUrl: result.applyUrl },
      });

      if (existing) {
        // Re-scrape: refresh scraped fields only. Enrichment bookkeeping and
        // Claude-set values are preserved (see persistData.ts).
        await prisma.opportunity.update({
          where: { id: existing.id },
          data: buildUpdateData(result, existing),
        });
        updated++;
      } else {
        // Cross-source dedup: check if an event with the same normalized title+org already exists
        const dedupKey = generateDeduplicationKey(result.title, result.organization);
        const orgPrefix = (result.organization || '').substring(0, 10);
        let dedupMatchId: string | undefined;
        let dedupMatchScore: number | null = null;

        if (orgPrefix.length > 0) {
          const candidates = await prisma.opportunity.findMany({
            where: { organization: { contains: orgPrefix } },
            select: { id: true, title: true, organization: true, qualityScore: true },
            take: 50,
          });

          const match = candidates.find(c =>
            generateDeduplicationKey(c.title, c.organization) === dedupKey
          );
          dedupMatchId = match?.id;
          dedupMatchScore = match?.qualityScore ?? null;
        }

        if (dedupMatchId) {
          const createData = buildCreateData(result);
          // Merge into the existing record if the new one has equal or better quality.
          // applyUrl is deliberately left alone so saved links stay stable.
          if (createData.qualityScore >= (dedupMatchScore || 0)) {
            const dedupRow = await prisma.opportunity.findUnique({ where: { id: dedupMatchId } });
            if (dedupRow) {
              await prisma.opportunity.update({
                where: { id: dedupRow.id },
                data: buildUpdateData(result, dedupRow),
              });
            }
          }
          updated++;
        } else {
          await prisma.opportunity.create({ data: buildCreateData(result) });
          added++;
        }
      }
    } catch (error) {
      console.error(`Error saving opportunity: ${result.title}`, error);
    }
  }

  return { added, updated };
}

async function cleanupExpired(): Promise<number> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Rows a user has saved are never deleted: deleting them would cascade to
  // their SavedOpportunity rows. They stay in the DB and are hidden from
  // browse by the future-deadline filter.
  const notSaved = { savedBy: { none: {} } };

  // Delete expired, unsaved, non-live results
  const expiredResult = await prisma.opportunity.deleteMany({
    where: {
      cfpDeadline: { lt: now },
      NOT: { source: { startsWith: 'Live Search' } },
      ...notSaved,
    },
  });

  // Delete stale, unsaved live search results (7-day TTL)
  const staleLiveResult = await prisma.opportunity.deleteMany({
    where: {
      source: { startsWith: 'Live Search' },
      createdAt: { lt: sevenDaysAgo },
      ...notSaved,
    },
  });

  const total = expiredResult.count + staleLiveResult.count;
  console.log(`[Cleanup] Removed ${expiredResult.count} expired + ${staleLiveResult.count} stale live results`);
  return total;
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
  const recalculated = await recalculateAllQualityScores();

  console.log(
    `Sync complete (${mode}): ${added} added, ${updated} updated, ${deletedCount} expired removed, ${backfilled} quality backfilled, ${recalculated} quality recalculated`
  );

  const total = await prisma.opportunity.count();
  return { added, updated, total, mode };
}
