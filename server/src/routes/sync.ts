import { Router, Request, Response, NextFunction } from 'express';
import { syncOpportunities } from '../scrapers/index.js';

const router = Router();

let isSyncing = false;
let lastSyncResult: { added: number; updated: number; total: number } | null = null;
let lastSyncTime: Date | null = null;

router.post('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (isSyncing) {
      res.status(409).json({
        success: false,
        error: 'Sync already in progress',
      });
      return;
    }

    isSyncing = true;

    const result = await syncOpportunities();
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
