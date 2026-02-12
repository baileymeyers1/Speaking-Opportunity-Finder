import { Router, Request, Response, NextFunction } from 'express';
import { syncOpportunities } from '../scrapers/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();

// Protect sync endpoints with authentication and admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

let isSyncing = false;
let lastSyncResult: { added: number; updated: number; total: number; mode: string } | null = null;
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

    const result = await syncOpportunities(syncMode);
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
