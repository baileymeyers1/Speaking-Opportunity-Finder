import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const router = Router();

// All admin routes require authentication AND admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all analytics data
router.get('/analytics', adminController.getAnalytics);

// Get individual analytics sections
router.get('/analytics/scraper-health', adminController.getScraperHealth);
router.get('/analytics/source-quality', adminController.getSourceQuality);
router.get('/analytics/database-stats', adminController.getDatabaseStats);
router.get('/analytics/live-search', adminController.getLiveSearchAnalytics);
router.get('/analytics/system-health', adminController.getSystemHealth);

export default router;
