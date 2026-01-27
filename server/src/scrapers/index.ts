import { PrismaClient } from '@prisma/client';
import { scrapeConfsTech } from './confstech.js';
import { scrapeJavaConferences } from './javaconferences.js';
import { scrapeLinkupCFPs } from './linkupcfp.js';
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

export async function runAllScrapers(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  const seenUrls = new Set<string>();

  // Run scrapers - some in parallel, Linkup sequentially to manage rate limits
  const [confsTechResults, javaResults] = await Promise.all([
    scrapeConfsTech(),
    scrapeJavaConferences(),
  ]);

  // Add results, deduplicating by URL
  for (const result of [...confsTechResults, ...javaResults]) {
    if (!seenUrls.has(result.applyUrl)) {
      results.push(result);
      seenUrls.add(result.applyUrl);
    }
  }

  // Run Linkup CFP discovery (uses API calls, so run separately)
  const linkupResults = await scrapeLinkupCFPs(config.scrapers?.webSearch);
  for (const result of linkupResults) {
    if (!seenUrls.has(result.applyUrl)) {
      results.push(result);
      seenUrls.add(result.applyUrl);
    }
  }

  console.log(`Total opportunities found: ${results.length}`);
  return results;
}

export async function syncOpportunities(): Promise<{
  added: number;
  updated: number;
  total: number;
}> {
  console.log('Starting opportunity sync...');

  const results = await runAllScrapers();
  let added = 0;
  let updated = 0;

  for (const result of results) {
    try {
      // Use applyUrl as unique identifier
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

  // Clean up expired CFPs (deadline passed more than 7 days ago)
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 7);

  const deleted = await prisma.opportunity.deleteMany({
    where: {
      cfpDeadline: {
        lt: expiredDate,
      },
      source: {
        not: 'manual', // Don't delete manually added opportunities
      },
    },
  });

  console.log(
    `Sync complete: ${added} added, ${updated} updated, ${deleted.count} expired removed`
  );

  const total = await prisma.opportunity.count();
  return { added, updated, total };
}
