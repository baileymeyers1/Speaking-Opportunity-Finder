import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

// Admin emails list
const ADMIN_EMAILS = ['baileymeyers1@gmail.com'];

export function adminMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }

  if (!ADMIN_EMAILS.includes(req.user.email)) {
    throw new AppError(403, 'Admin access required');
  }

  next();
}
