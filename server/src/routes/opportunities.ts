import { Router } from 'express';
import * as opportunitiesController from '../controllers/opportunitiesController.js';

const router = Router();

router.get('/', opportunitiesController.getOpportunities);
router.get('/filters', opportunitiesController.getFilterOptions);
router.get('/live-search', opportunitiesController.liveSearch);
router.post('/save-live', opportunitiesController.saveLiveResult);
router.get('/:id', opportunitiesController.getOpportunityById);

export default router;
