import { Router, type Request, type Response } from 'express';
import { syncOpportunities } from '../scrapers/index.js';
import { processNextBatch } from '../services/backgroundEnrichment.js';

const router = Router();

// vercel.json caps functions at 60s; leave headroom for the response.
const CRON_TIME_BUDGET_MS = 50_000;

/**
 * Verify Vercel cron secret to prevent unauthorized access.
 * Vercel sends: Authorization: Bearer <CRON_SECRET>
 */
function verifyCronSecret(req: Request, res: Response): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // No secret configured — allow in development, block in production
    if (process.env.NODE_ENV === 'production') {
      res.status(401).json({ error: 'CRON_SECRET not configured' });
      return false;
    }
    return true;
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

/**
 * Daily sync — fast scrapers
 * Triggered by Vercel cron at 0 6 * * *
 */
router.get('/daily-sync', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;

  try {
    console.log('[Cron] Running daily sync...');
    const result = await syncOpportunities('daily', { timeBudgetMs: CRON_TIME_BUDGET_MS });
    console.log(`[Cron] Daily sync complete: ${result.added} added, ${result.updated} updated, ${result.skipped.length} skipped`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Cron] Daily sync failed:', error);
    res.status(500).json({
      error: 'Daily sync failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Weekly sync — deep scrapers (Linkup, Eventbrite, etc.)
 * Triggered by Vercel cron at 0 8 * * 1
 */
router.get('/weekly-sync', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;

  try {
    console.log('[Cron] Running weekly deep sync...');
    const result = await syncOpportunities('weekly', { timeBudgetMs: CRON_TIME_BUDGET_MS });
    console.log(`[Cron] Weekly sync complete: ${result.added} added, ${result.updated} updated, ${result.skipped.length} skipped`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Cron] Weekly sync failed:', error);
    res.status(500).json({
      error: 'Weekly sync failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Enrichment batch, every 5 minutes: up to 15 rows, three at a time, none
 * started after 35s. A row is a page fetch (8s, then the reader's 12s) and a
 * Claude call, typically 5 to 10s in all, so a run ends near 45s, inside the
 * function's 60s. One row at a time read 5 a run, and a live search's 35
 * leftover pages waited over half an hour.
 */
const ENRICHMENT_BATCH = { count: 15, concurrency: 3, timeBudgetMs: 35_000 };

router.get('/enrichment', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;

  try {
    console.log('[Cron] Running enrichment batch...');
    const result = await processNextBatch(ENRICHMENT_BATCH.count, ENRICHMENT_BATCH);
    console.log(`[Cron] Enrichment batch complete: ${result.processed} processed, ${result.enriched} enriched, ${result.verified} verified`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Cron] Enrichment batch failed:', error);
    res.status(500).json({
      error: 'Enrichment batch failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
