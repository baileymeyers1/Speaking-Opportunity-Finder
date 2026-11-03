import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

// Limits protect production. In development the browser's StrictMode double
// requests and the Playwright suite exhaust them within a minute, so they are
// skipped there (the in-memory store is per-process either way).
const skip = () => config.isDev;

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many auth attempts, please try again later.' },
});

export const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many search requests, please try again later.' },
});
