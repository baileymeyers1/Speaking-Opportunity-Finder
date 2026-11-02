import { prisma } from '../lib/prisma.js';
import { enrichOpportunity, planEnrichment } from './enrichmentService.js';
import { fetchPageText } from './pageText.js';
import { config } from '../config/index.js';
import { computeQualityScore, type ScraperResult } from '../scrapers/qualityScore.js';
import {
  claimNextUnenriched,
  getTodayEnrichmentCount,
  MAX_ENRICHMENT_ATTEMPTS,
  releaseClaim,
  releaseEnrichmentSlot,
  reserveEnrichmentSlot,
} from './enrichmentBudget.js';

/**
 * In-process counters for the admin dashboard. These are informational only;
 * the daily budget and row claims live in the database (enrichmentBudget.ts)
 * so they survive serverless cold starts.
 */
interface BackgroundEnrichmentState {
  isRunning: boolean;
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
  retried: number;
  lastRunTime: Date | null;
  dailyEnrichmentCount: number;
}

let state: BackgroundEnrichmentState = {
  isRunning: false,
  processed: 0,
  enriched: 0,
  skipped: 0,
  failed: 0,
  retried: 0,
  lastRunTime: null,
  dailyEnrichmentCount: 0,
};

let enrichmentTimer: NodeJS.Timeout | null = null;

type OpportunityRow = NonNullable<Awaited<ReturnType<typeof claimNextUnenriched>>>;

function toScraperResult(opportunity: OpportunityRow): ScraperResult {
  return {
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
}

async function markSkipped(id: string, reason: string): Promise<void> {
  await prisma.opportunity.update({
    where: { id },
    data: {
      enrichmentStatus: 'skipped',
      enrichedAt: new Date(),
      enrichmentError: reason,
      enrichmentClaimedAt: null,
    },
  });
}

/** The apply page is gone (404/410): the call is over, whatever the scraped data says. */
async function markClosedByPage(opportunity: OpportunityRow, reason: string): Promise<void> {
  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: {
      isClosed: true,
      qualityScore: 0,
      enrichmentStatus: 'enriched',
      enrichedAt: new Date(),
      enrichmentError: `Page unavailable: ${reason}`,
      enrichmentClaimedAt: null,
    },
  });
}

/**
 * A failed attempt is retried on a later run until MAX_ENRICHMENT_ATTEMPTS,
 * then marked failed for good. Transient errors (rate limits, truncation,
 * network) therefore don't permanently poison a row.
 */
async function recordFailure(opportunity: OpportunityRow, message: string): Promise<'retry' | 'failed'> {
  const exhausted = opportunity.enrichmentAttempts >= MAX_ENRICHMENT_ATTEMPTS;
  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: {
      enrichmentStatus: exhausted ? 'failed' : null,
      enrichmentError: message,
      enrichedAt: exhausted ? new Date() : null,
      enrichmentClaimedAt: null,
    },
  });
  return exhausted ? 'failed' : 'retry';
}

export type WorkerOutcome = 'processed' | 'none' | 'budget_exhausted';

/**
 * Fetch the apply page and enrich the row from its text (the scraped
 * description is often 50-80 chars of boilerplate). A 404/410 closes the
 * listing without a Claude call.
 */
async function processNextUnenriched(): Promise<WorkerOutcome> {
  if (!config.claude.apiKey) {
    console.log('Background enrichment: No Claude API key configured, skipping');
    return 'none';
  }

  let opportunity: OpportunityRow | null = null;
  try {
    opportunity = await claimNextUnenriched(prisma);
    if (!opportunity) {
      console.log('Background enrichment: No unenriched opportunities found');
      return 'none';
    }

    const scraperResult = toScraperResult(opportunity);
    const page = await fetchPageText(opportunity.applyUrl);
    const plan = planEnrichment(scraperResult, page);
    state.processed++;
    state.lastRunTime = new Date();

    // Decisions that don't need Claude and shouldn't consume budget.
    if (plan.action === 'closed') {
      await markClosedByPage(opportunity, plan.reason);
      state.enriched++;
      console.log(`Background enrichment: Closed "${opportunity.title}" (${plan.reason})`);
      return 'processed';
    }
    if (plan.action === 'skip') {
      await markSkipped(opportunity.id, plan.reason);
      state.skipped++;
      console.log(`Background enrichment: Skipped "${opportunity.title}" (${plan.reason})`);
      return 'processed';
    }

    const budget = await reserveEnrichmentSlot(prisma);
    state.dailyEnrichmentCount = budget.count;
    if (!budget.reserved) {
      state.processed--;
      await releaseClaim(prisma, opportunity.id);
      console.log(`[BackgroundEnrichment] Daily budget reached (${budget.count}). Pausing until tomorrow (UTC).`);
      return 'budget_exhausted';
    }

    console.log(
      `Background enrichment: Processing "${opportunity.title}" (attempt ${opportunity.enrichmentAttempts}/${MAX_ENRICHMENT_ATTEMPTS}, page ${plan.pageText ? `${plan.pageText.length} chars` : `unavailable: ${plan.pageError}`})`
    );

    const enriched = await enrichOpportunity(scraperResult, { pageText: plan.pageText });

    if (enriched.enrichmentStatus === 'enriched') {
      const isClosed = enriched.isClosed === true;
      const isRelevant = enriched.isRelevant !== false;

      // enrichOpportunity already merged the extraction into the row (extraction.ts rules).
      const mergedResult: ScraperResult = { ...enriched, isClosed, isRelevant };

      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          title: mergedResult.title,
          organization: mergedResult.organization,
          cfpDeadline: mergedResult.cfpDeadline || null,
          eventDate: mergedResult.eventDate || null,
          industries: JSON.stringify(mergedResult.industries),
          location: mergedResult.location || null,
          compensationType: mergedResult.compensationType || null,
          compensationAmount: mergedResult.compensationAmount || null,
          compensationDetails: mergedResult.compensationDetails || null,
          isRemote: mergedResult.isRemote,
          isClosed,
          isRelevant,
          // Stored as columns so recalculateAllQualityScores keeps the score at 0.
          qualityScore: computeQualityScore(mergedResult),
          enrichmentStatus: 'enriched',
          enrichedAt: enriched.enrichedAt || new Date(),
          enrichmentError: null,
          enrichmentClaimedAt: null,
        },
      });

      state.enriched++;
      if (isClosed) console.log(`Background enrichment: Marked "${opportunity.title}" as closed CFP`);
      if (!isRelevant) console.log(`Background enrichment: Marked "${opportunity.title}" as not a speaking opportunity`);
      console.log(`Background enrichment: Successfully enriched "${opportunity.title}"`);
      return 'processed';
    }

    if (enriched.enrichmentStatus === 'skipped') {
      // The API was not called after all; give the slot back.
      await releaseEnrichmentSlot(prisma);
      await markSkipped(opportunity.id, enriched.enrichmentError || 'skipped');
      state.skipped++;
      return 'processed';
    }

    const outcome = await recordFailure(opportunity, enriched.enrichmentError || 'Unknown enrichment error');
    if (outcome === 'retry') {
      state.retried++;
      console.log(`Background enrichment: Will retry "${opportunity.title}": ${enriched.enrichmentError}`);
    } else {
      state.failed++;
      console.log(`Background enrichment: Failed "${opportunity.title}" after ${MAX_ENRICHMENT_ATTEMPTS} attempts: ${enriched.enrichmentError}`);
    }
    return 'processed';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Background enrichment error:', error);
    if (opportunity) {
      try {
        const outcome = await recordFailure(opportunity, message);
        if (outcome === 'retry') state.retried++;
        else state.failed++;
      } catch (writeError) {
        console.error('[BackgroundEnrichment] Could not record failure:', writeError);
      }
    } else {
      state.failed++;
    }
    return 'processed';
  }
}

/**
 * Start the background enrichment loop (long-running process mode only).
 */
export function startBackgroundEnrichment(): void {
  if (enrichmentTimer) {
    console.log('Background enrichment: Already running');
    return;
  }

  console.log('Background enrichment: Starting (1 opportunity every 1 minute)');
  state.isRunning = true;

  processNextUnenriched();
  enrichmentTimer = setInterval(() => {
    processNextUnenriched();
  }, 60 * 1000);
}

export function stopBackgroundEnrichment(): void {
  if (enrichmentTimer) {
    clearInterval(enrichmentTimer);
    enrichmentTimer = null;
    state.isRunning = false;
    console.log('Background enrichment: Stopped');
  }
}

export function getBackgroundEnrichmentState(): BackgroundEnrichmentState {
  return { ...state };
}

/** Async variant that reads today's spend from the DB rather than process memory. */
export async function getBackgroundEnrichmentStateWithBudget(): Promise<BackgroundEnrichmentState> {
  const dailyEnrichmentCount = await getTodayEnrichmentCount(prisma);
  state.dailyEnrichmentCount = dailyEnrichmentCount;
  return { ...state };
}

export interface BatchOptions {
  /** Stop starting new rows once this much wall-clock time has passed. */
  timeBudgetMs?: number;
  now?: () => number;
}

/**
 * Process a batch of up to N unenriched opportunities synchronously, within
 * a time budget (each row now costs a page fetch plus a Claude call).
 * Used by the Vercel cron endpoint instead of setInterval.
 */
export async function processNextBatch(count: number, options: BatchOptions = {}): Promise<{
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
  retried: number;
}> {
  const before = { ...state };
  const now = options.now ?? Date.now;
  const startedAt = now();
  const withinBudget = () => options.timeBudgetMs === undefined || now() - startedAt < options.timeBudgetMs;

  for (let i = 0; i < count && withinBudget(); i++) {
    const outcome = await processNextUnenriched();
    if (outcome !== 'processed') break;
  }
  return {
    processed: state.processed - before.processed,
    enriched: state.enriched - before.enriched,
    skipped: state.skipped - before.skipped,
    failed: state.failed - before.failed,
    retried: state.retried - before.retried,
  };
}

export function resetBackgroundEnrichmentStats(): void {
  state.processed = 0;
  state.enriched = 0;
  state.skipped = 0;
  state.failed = 0;
  state.retried = 0;
}
