import { Router } from 'express';
import authRoutes from './auth.js';
import opportunitiesRoutes from './opportunities.js';
import savedRoutes from './saved.js';
import syncRoutes from './sync.js';
import adminRoutes from './admin.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/opportunities', opportunitiesRoutes);
router.use('/saved', savedRoutes);
router.use('/sync', syncRoutes);
router.use('/admin', adminRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
