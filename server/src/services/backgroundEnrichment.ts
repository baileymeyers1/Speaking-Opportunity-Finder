import { PrismaClient } from '@prisma/client';
import { enrichOpportunity } from './enrichmentService.js';
import { config } from '../config/index.js';
import { computeQualityScore, ScraperResult } from '../scrapers/index.js';

const prisma = new PrismaClient();

const DAILY_ENRICHMENT_LIMIT = 200;

interface BackgroundEnrichmentState {
  isRunning: boolean;
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
  lastRunTime: Date | null;
  dailyEnrichmentCount: number;
  dailyBudgetResetDate: string;
}

let state: BackgroundEnrichmentState = {
  isRunning: false,
  processed: 0,
  enriched: 0,
  skipped: 0,
  failed: 0,
  lastRunTime: null,
  dailyEnrichmentCount: 0,
  dailyBudgetResetDate: new Date().toDateString(),
};

let enrichmentTimer: NodeJS.Timeout | null = null;

/**
 * Process one unenriched opportunity at a time with rate limiting
 * Runs every 2 minutes to avoid hitting API rate limits
 */
async function processNextUnenriched(): Promise<void> {
  if (!config.claude.apiKey) {
    console.log('Background enrichment: No Claude API key configured, skipping');
    return;
  }

  const today = new Date().toDateString();
  if (state.dailyBudgetResetDate !== today) {
    state.dailyEnrichmentCount = 0;
    state.dailyBudgetResetDate = today;
  }

  if (state.dailyEnrichmentCount >= DAILY_ENRICHMENT_LIMIT) {
    console.log(`[BackgroundEnrichment] Daily budget of ${DAILY_ENRICHMENT_LIMIT} reached. Pausing until tomorrow.`);
    return;
  }

  try {
    // Find one unenriched opportunity (null enrichmentStatus)
    const opportunity = await prisma.opportunity.findFirst({
      where: {
        enrichmentStatus: null,
      },
      orderBy: {
        createdAt: 'desc', // Process newer opportunities first
      },
    });

    if (!opportunity) {
      console.log('Background enrichment: No unenriched opportunities found');
      return;
    }

    console.log(`Background enrichment: Processing opportunity "${opportunity.title}" (ID: ${opportunity.id})`);

    // Convert to ScraperResult format for enrichment
    const scraperResult = {
      title: opportunity.title,
      organization: opportunity.organization,
      description: opportunity.description || undefined,
      location: opportunity.location || undefined,
      isRemote: opportunity.isRemote,
      eventDate: opportunity.eventDate || undefined,
      cfpDeadline: opportunity.cfpDeadline || undefined,
      format: opportunity.format,
      industries: (() => {
        try {
          return JSON.parse(opportunity.industries) as string[];
        } catch {
          return [];
        }
      })(),
      compensationType: opportunity.compensationType || undefined,
      compensationAmount: opportunity.compensationAmount || undefined,
      compensationDetails: opportunity.compensationDetails || undefined,
      applyUrl: opportunity.applyUrl,
      source: opportunity.source,
      sourceUrl: opportunity.sourceUrl || undefined,
    };

    // Enrich the opportunity — wrapped in inner try/catch to ensure
    // enrichmentStatus is ALWAYS set, even if enrichment throws
    try {
      const enriched = await enrichOpportunity(scraperResult);

      // Update the opportunity with enrichment results
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          title: enriched.cleanTitle || opportunity.title,
          organization: enriched.cleanOrganization || opportunity.organization,
          cfpDeadline: enriched.cfpDeadline || opportunity.cfpDeadline,
          eventDate: enriched.eventDate || opportunity.eventDate,
          industries: enriched.industries
            ? JSON.stringify(enriched.industries)
            : opportunity.industries,
          location: enriched.location || opportunity.location,
          compensationType: enriched.compensationType || opportunity.compensationType,
          compensationAmount: enriched.compensationAmount || opportunity.compensationAmount,
          compensationDetails: enriched.compensationDetails || opportunity.compensationDetails,
          isRemote: enriched.isRemote !== undefined ? enriched.isRemote : opportunity.isRemote,
          enrichmentStatus: enriched.enrichmentStatus || 'failed',
          enrichedAt: enriched.enrichedAt || new Date(),
          enrichmentError: enriched.enrichmentError,
        },
      });

      // Recalculate quality score with enriched data
      const enrichedResult: ScraperResult = {
        title: opportunity.title,
        organization: opportunity.organization,
        description: opportunity.description || undefined,
        location: enriched.location || opportunity.location || undefined,
        isRemote: enriched.isRemote ?? opportunity.isRemote,
        eventDate: enriched.eventDate || (opportunity.eventDate ? new Date(opportunity.eventDate) : undefined),
        cfpDeadline: enriched.cfpDeadline || (opportunity.cfpDeadline ? new Date(opportunity.cfpDeadline) : undefined),
        format: opportunity.format,
        industries: enriched.industries || (() => { try { return JSON.parse(opportunity.industries || '[]'); } catch { return []; } })(),
        compensationType: enriched.compensationType || opportunity.compensationType || undefined,
        compensationAmount: enriched.compensationAmount || opportunity.compensationAmount || undefined,
        applyUrl: opportunity.applyUrl,
        source: opportunity.source,
      };

      const newScore = computeQualityScore(enrichedResult);
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: { qualityScore: newScore },
      });

      if (enriched.isRelevant === false || enriched.isClosed === true) {
        await prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { qualityScore: 0 },
        });
        if (enriched.isClosed) {
          console.log(`Background enrichment: Marked "${opportunity.title}" as closed CFP (quality=0)`);
        }
      }

      // Update state
      state.processed++;
      state.lastRunTime = new Date();

      if (enriched.enrichmentStatus === 'enriched') {
        state.enriched++;
        state.dailyEnrichmentCount++;
        console.log(`Background enrichment: Successfully enriched "${opportunity.title}"`);
      } else if (enriched.enrichmentStatus === 'skipped') {
        state.skipped++;
        console.log(`Background enrichment: Skipped "${opportunity.title}" (already complete)`);
      } else {
        state.failed++;
        console.log(`Background enrichment: Failed "${opportunity.title}": ${enriched.enrichmentError}`);
      }
    } catch (enrichmentError) {
      // ALWAYS mark as failed so it doesn't retry forever
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          enrichmentStatus: 'failed',
          enrichmentError: enrichmentError instanceof Error ? enrichmentError.message : 'Unknown error',
          enrichedAt: new Date(),
        },
      });
      state.processed++;
      state.failed++;
      state.lastRunTime = new Date();
      console.error(`[BackgroundEnrichment] Failed to enrich opportunity ${opportunity.id}:`, enrichmentError);
    }

  } catch (error) {
    console.error('Background enrichment error:', error);
    state.failed++;
  }
}

/**
 * Start the background enrichment service
 * Processes one opportunity every 2 minutes to avoid rate limits
 */
export function startBackgroundEnrichment(): void {
  if (enrichmentTimer) {
    console.log('Background enrichment: Already running');
    return;
  }

  console.log('Background enrichment: Starting (1 opportunity every 1 minute)');
  state.isRunning = true;

  // Process immediately
  processNextUnenriched();

  // Then process every 2 minutes
  enrichmentTimer = setInterval(() => {
    processNextUnenriched();
  }, 60 * 1000); // 1 minute
}

/**
 * Stop the background enrichment service
 */
export function stopBackgroundEnrichment(): void {
  if (enrichmentTimer) {
    clearInterval(enrichmentTimer);
    enrichmentTimer = null;
    state.isRunning = false;
    console.log('Background enrichment: Stopped');
  }
}

/**
 * Get current enrichment state
 */
export function getBackgroundEnrichmentState(): BackgroundEnrichmentState {
  return { ...state };
}

/**
 * Process a batch of N unenriched opportunities synchronously.
 * Used by Vercel cron endpoints instead of setInterval.
 */
export async function processNextBatch(count: number): Promise<{
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
}> {
  const results = { processed: 0, enriched: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < count; i++) {
    const before = { ...state };
    await processNextUnenriched();
    const after = state;

    results.processed += after.processed - before.processed;
    results.enriched += after.enriched - before.enriched;
    results.skipped += after.skipped - before.skipped;
    results.failed += after.failed - before.failed;
  }

  return results;
}

/**
 * Reset enrichment statistics
 */
export function resetBackgroundEnrichmentStats(): void {
  state.processed = 0;
  state.enriched = 0;
  state.skipped = 0;
  state.failed = 0;
}
