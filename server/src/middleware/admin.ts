import { prisma } from '../lib/prisma.js';
import { Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export async function adminMiddleware(req: any, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError(401, 'Authentication required'));
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return next(new AppError(403, 'Admin access required'));
  }

  next();
}
