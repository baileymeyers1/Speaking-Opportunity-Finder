import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { fetchPublicListings, refreshDemoListings } from './listings.js';
import { createDemoVisitor, DEMO_SESSION_MS, pruneDemoVisitors } from './visitors.js';

/**
 * Routes that exist only in the demo (mounted by routes/index.ts when DEMO_MODE=true), and the production
 * routes the demo switches off: passwords, sign-up, resets, the scrapers and the admin pages.
 */

/** Production paths under /api that answer 404 in the demo. */
export const DEMO_DISABLED_PATHS = [
  '/auth/register',
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/sync',
  '/admin',
  '/cron/daily-sync',
  '/cron/weekly-sync',
  '/cron/enrichment',
];

export function blockDisabledInDemo(req: Request, res: Response, next: NextFunction): void {
  if (DEMO_DISABLED_PATHS.some((path) => req.path === path || req.path.startsWith(`${path}/`))) {
    res.status(404).json({ success: false, error: 'Not available in the demo' });
    return;
  }
  next();
}

const router = Router();

/** "Enter the demo": a fresh account with the sample roster, signed in for this visit. */
router.post('/auth/demo', authLimiter, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { user, token } = await createDemoVisitor();
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: DEMO_SESSION_MS,
      path: '/',
    });
    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
});

/** Daily (vercel.json in the demo project): refresh the listings copy and drop old visits. */
router.get('/cron/demo-listings', async (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const result = await refreshDemoListings(prisma, { listings: await fetchPublicListings() });
    const visitsRemoved = await pruneDemoVisitors();
    res.json({ success: true, ...result, visitsRemoved });
  } catch (error) {
    next(error);
  }
});

export default router;
