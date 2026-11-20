import { Router } from 'express';
import * as speakersController from '../controllers/speakersController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// A roster belongs to the signed-in account only.
router.use(authMiddleware);

router.get('/', speakersController.listSpeakers);
router.post('/', speakersController.createSpeaker);
router.put('/:id', speakersController.updateSpeaker);
router.delete('/:id', speakersController.deleteSpeaker);

export default router;
