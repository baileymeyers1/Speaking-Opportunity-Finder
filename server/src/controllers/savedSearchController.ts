import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

export async function getSavedSearches(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const searches = await prisma.savedSearch.findMany({
      where: { userId: req.user.userId },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ success: true, data: searches });
  } catch (error) {
    next(error);
  }
}

export async function createSavedSearch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { name, query, filters } = req.body;

    if (!name) {
      throw new AppError(400, 'Name is required');
    }

    const search = await prisma.savedSearch.create({
      data: {
        userId: req.user.userId,
        name,
        query: query || null,
        filters: JSON.stringify(filters || {}),
      },
    });

    res.status(201).json({ success: true, data: search });
  } catch (error) {
    next(error);
  }
}

export async function updateSavedSearch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { id } = req.params;
    const { name, query, filters } = req.body;

    const existing = await prisma.savedSearch.findFirst({
      where: { id, userId: req.user.userId },
    });

    if (!existing) {
      throw new AppError(404, 'Saved search not found');
    }

    const updated = await prisma.savedSearch.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(query !== undefined && { query }),
        ...(filters && { filters: JSON.stringify(filters) }),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

export async function deleteSavedSearch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { id } = req.params;

    const existing = await prisma.savedSearch.findFirst({
      where: { id, userId: req.user.userId },
    });

    if (!existing) {
      throw new AppError(404, 'Saved search not found');
    }

    await prisma.savedSearch.delete({ where: { id } });

    res.json({ success: true, message: 'Saved search removed' });
  } catch (error) {
    next(error);
  }
}
