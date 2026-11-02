import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

// The strict limiter guards credential attempts only. `/me` runs on every page
// load and `/logout` is harmless, so they stay under the general limiter; with
// them included, ten page loads locked a user out of logging in for 15 minutes.
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPasswordHandler);
router.get('/me', authMiddleware, authController.me);

export default router;
