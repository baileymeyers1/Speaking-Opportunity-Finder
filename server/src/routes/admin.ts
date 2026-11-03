import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();

// All admin routes require authentication AND admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

// One endpoint per dashboard section
router.get('/analytics/sources', adminController.getSources);
router.get('/analytics/pipeline', adminController.getPipeline);
router.get('/analytics/catalogue', adminController.getCatalogue);
router.get('/analytics/demand', adminController.getDemand);

// Manual enrichment batch (the cron's work, on demand). Scrapers run through POST /api/sync.
router.post('/enrichment/run', adminController.runEnrichmentBatch);

export default router;
