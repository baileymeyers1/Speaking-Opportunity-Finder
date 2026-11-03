import { Router } from 'express';
import authRoutes from './auth.js';
import opportunitiesRoutes from './opportunities.js';
import savedRoutes from './saved.js';
import syncRoutes from './sync.js';
import adminRoutes from './admin.js';
import cronRoutes from './cron.js';
import savedSearchRoutes from './savedSearches.js';
import profileRoutes from './profile.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/opportunities', opportunitiesRoutes);
router.use('/saved', savedRoutes);
router.use('/saved-searches', savedSearchRoutes);
router.use('/profile', profileRoutes);
router.use('/sync', syncRoutes);
router.use('/admin', adminRoutes);
router.use('/cron', cronRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
