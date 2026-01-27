import { Router } from 'express';
import * as savedController from '../controllers/savedController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All saved routes require authentication
router.use(authMiddleware);

router.get('/', savedController.getSavedOpportunities);
router.post('/', savedController.saveOpportunity);
router.patch('/:id', savedController.updateSavedOpportunity);
router.delete('/:id', savedController.deleteSavedOpportunity);

export default router;
