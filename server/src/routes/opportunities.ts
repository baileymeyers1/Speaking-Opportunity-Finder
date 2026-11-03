import { Router } from 'express';
import * as opportunitiesController from '../controllers/opportunitiesController.js';
import { optionalAuthMiddleware } from '../middleware/auth.js';

const router = Router();

// Public, but a signed-in user's live searches are attributed in the search log.
router.get('/', optionalAuthMiddleware, opportunitiesController.getOpportunities);
router.get('/filters', opportunitiesController.getFilterOptions);
router.get('/live-search', optionalAuthMiddleware, opportunitiesController.liveSearch);
router.post('/save-live', opportunitiesController.saveLiveResult);
router.get('/:id', opportunitiesController.getOpportunityById);

export default router;
