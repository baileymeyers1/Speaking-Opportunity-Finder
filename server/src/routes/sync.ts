import { Router, type Request, type Response, type NextFunction } from 'express';
import { syncOpportunities, SCRAPERS, type SyncSummary } from '../scrapers/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();

// Protect sync endpoints with authentication and admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

let isSyncing = false;
let lastSyncResult: SyncSummary | null = null;
let lastSyncTime: Date | null = null;

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (isSyncing) {
      res.status(409).json({
        success: false,
        error: 'Sync already in progress',
      });
      return;
    }

    isSyncing = true;

    // Support mode query parameter: daily, weekly, or full (default)
    const mode = (req.query.mode as string) || 'full';
    const validModes = ['daily', 'weekly', 'full'] as const;
    const syncMode = validModes.includes(mode as typeof validModes[number])
      ? (mode as 'daily' | 'weekly' | 'full')
      : 'full';

    // Optional ?scraper=name (repeatable) to run a subset, e.g. to test one source.
    const onlyParam = req.query.scraper;
    const only = onlyParam
      ? (Array.isArray(onlyParam) ? onlyParam.map(String) : [String(onlyParam)]).filter((n) =>
          SCRAPERS.some((s) => s.name === n)
        )
      : undefined;

    const result = await syncOpportunities(syncMode, {
      only,
      // Serverless functions are capped at 60s; a long-running server has no limit.
      timeBudgetMs: process.env.VERCEL ? 50_000 : undefined,
    });
    lastSyncResult = result;
    lastSyncTime = new Date();

    isSyncing = false;

    res.json({
      success: true,
      data: {
        ...result,
        syncedAt: lastSyncTime,
      },
    });
  } catch (error) {
    isSyncing = false;
    next(error);
  }
});

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      isSyncing,
      scrapers: SCRAPERS.map((s) => ({ name: s.name, cadence: s.cadence })),
      lastSync: lastSyncResult
        ? {
            ...lastSyncResult,
            syncedAt: lastSyncTime,
          }
        : null,
    },
  });
});

export default router;
