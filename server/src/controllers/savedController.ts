import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Opportunity } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function transformOpportunity(opp: Opportunity) {
  return {
    ...opp,
    industries: parseJsonArray(opp.industries),
  };
}

export async function getSavedOpportunities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { category } = req.query;

    const where: { userId: string; category?: string } = {
      userId: req.user.userId,
    };

    if (category) {
      where.category = String(category);
    }

    const saved = await prisma.savedOpportunity.findMany({
      where,
      include: {
        opportunity: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const transformedSaved = saved.map((item) => ({
      ...item,
      opportunity: item.opportunity
        ? transformOpportunity(item.opportunity)
        : null,
    }));

    res.json({
      success: true,
      data: transformedSaved,
    });
  } catch (error) {
    next(error);
  }
}

export async function saveOpportunity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { opportunityId, category = 'interested' } = req.body;

    if (!opportunityId) {
      throw new AppError(400, 'Opportunity ID is required');
    }

    // Check if opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      throw new AppError(404, 'Opportunity not found');
    }

    const saved = await prisma.savedOpportunity.upsert({
      where: {
        userId_opportunityId: {
          userId: req.user.userId,
          opportunityId,
        },
      },
      update: { category },
      create: {
        userId: req.user.userId,
        opportunityId,
        category,
      },
      include: {
        opportunity: true,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...saved,
        opportunity: saved.opportunity
          ? transformOpportunity(saved.opportunity)
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSavedOpportunity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { id } = req.params;
    const { category } = req.body;

    if (!category) {
      throw new AppError(400, 'Category is required');
    }

    const existing = await prisma.savedOpportunity.findFirst({
      where: { id, userId: req.user.userId },
    });

    if (!existing) {
      throw new AppError(404, 'Saved opportunity not found');
    }

    const updated = await prisma.savedOpportunity.update({
      where: { id },
      data: { category },
      include: { opportunity: true },
    });

    res.json({
      success: true,
      data: {
        ...updated,
        opportunity: updated.opportunity
          ? transformOpportunity(updated.opportunity)
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteSavedOpportunity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const { id } = req.params;

    const existing = await prisma.savedOpportunity.findFirst({
      where: { id, userId: req.user.userId },
    });

    if (!existing) {
      throw new AppError(404, 'Saved opportunity not found');
    }

    await prisma.savedOpportunity.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Saved opportunity removed',
    });
  } catch (error) {
    next(error);
  }
}
