import { Router } from 'express';
import * as opportunitiesController from '../controllers/opportunitiesController.js';
import { optionalAuthMiddleware } from '../middleware/auth.js';

const router = Router();

// Public. The token, when present, attributes live searches in the search log
// and lets a speaker profile score the list and the detail.
router.get('/', optionalAuthMiddleware, opportunitiesController.getOpportunities);
router.get('/filters', opportunitiesController.getFilterOptions);
router.get('/live-search', optionalAuthMiddleware, opportunitiesController.liveSearch);
router.post('/save-live', opportunitiesController.saveLiveResult);
router.get('/:id', optionalAuthMiddleware, opportunitiesController.getOpportunityById);

export default router;
