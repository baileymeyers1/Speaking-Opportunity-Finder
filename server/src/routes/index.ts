import { Router } from 'express';
import authRoutes from './auth.js';
import opportunitiesRoutes from './opportunities.js';
import savedRoutes from './saved.js';
import syncRoutes from './sync.js';
import adminRoutes from './admin.js';
import cronRoutes from './cron.js';
import savedSearchRoutes from './savedSearches.js';
import speakersRoutes from './speakers.js';
import demoRoutes, { blockDisabledInDemo } from '../demo/routes.js';
import { isDemoMode } from '../demo/env.js';

const router = Router();

// The public demo adds its own routes and switches some off (src/demo/routes.ts).
if (isDemoMode()) {
  router.use(blockDisabledInDemo);
  router.use(demoRoutes);
}

router.use('/auth', authRoutes);
router.use('/opportunities', opportunitiesRoutes);
router.use('/saved', savedRoutes);
router.use('/saved-searches', savedSearchRoutes);
router.use('/speakers', speakersRoutes);
router.use('/sync', syncRoutes);
router.use('/admin', adminRoutes);
router.use('/cron', cronRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
