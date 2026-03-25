import { Router, Request, Response } from 'express';
import { syncOpportunities } from '../scrapers/index.js';
import { processNextBatch } from '../services/backgroundEnrichment.js';

const router = Router();

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
    const result = await syncOpportunities('daily');
    console.log(`[Cron] Daily sync complete: ${result.added} added, ${result.updated} updated`);
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
    const result = await syncOpportunities('weekly');
    console.log(`[Cron] Weekly sync complete: ${result.added} added, ${result.updated} updated`);
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
 * Enrichment batch — process up to 5 unenriched opportunities
 * Triggered by Vercel cron every 5 minutes
 */
router.get('/enrichment', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;

  try {
    console.log('[Cron] Running enrichment batch...');
    const result = await processNextBatch(5);
    console.log(`[Cron] Enrichment batch complete: ${result.processed} processed, ${result.enriched} enriched`);
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
