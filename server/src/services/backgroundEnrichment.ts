import { PrismaClient } from '@prisma/client';
import { enrichOpportunity } from './enrichmentService.js';
import { config } from '../config/index.js';

const prisma = new PrismaClient();

interface BackgroundEnrichmentState {
  isRunning: boolean;
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
  lastRunTime: Date | null;
}

let state: BackgroundEnrichmentState = {
  isRunning: false,
  processed: 0,
  enriched: 0,
  skipped: 0,
  failed: 0,
  lastRunTime: null,
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

    // Enrich the opportunity
    const enriched = await enrichOpportunity(scraperResult);

    // Update the opportunity with enrichment results
    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: {
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

    // Update state
    state.processed++;
    state.lastRunTime = new Date();

    if (enriched.enrichmentStatus === 'enriched') {
      state.enriched++;
      console.log(`Background enrichment: Successfully enriched "${opportunity.title}"`);
    } else if (enriched.enrichmentStatus === 'skipped') {
      state.skipped++;
      console.log(`Background enrichment: Skipped "${opportunity.title}" (already complete)`);
    } else {
      state.failed++;
      console.log(`Background enrichment: Failed "${opportunity.title}": ${enriched.enrichmentError}`);
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
 * Reset enrichment statistics
 */
export function resetBackgroundEnrichmentStats(): void {
  state.processed = 0;
  state.enriched = 0;
  state.skipped = 0;
  state.failed = 0;
}
