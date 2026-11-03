import { Router } from 'express';
import * as profileController from '../controllers/profileController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// The speaker profile belongs to the signed-in user only.
router.use(authMiddleware);

router.get('/', profileController.getProfile);
router.put('/', profileController.putProfile);

export default router;
