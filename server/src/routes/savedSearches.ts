import { Router } from 'express';
import * as savedSearchController from '../controllers/savedSearchController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All saved search routes require authentication
router.use(authMiddleware);

router.get('/', savedSearchController.getSavedSearches);
router.post('/', savedSearchController.createSavedSearch);
router.patch('/:id', savedSearchController.updateSavedSearch);
router.delete('/:id', savedSearchController.deleteSavedSearch);

export default router;
