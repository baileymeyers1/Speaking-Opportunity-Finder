import { type Request, type Response, type NextFunction } from 'express';
import { type Opportunity } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { normalizeSectors } from '../lib/sectors.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  AlreadySavedError,
  UnknownSpeakerError,
  changeSavedCall,
  isSavedCategory,
  saveCall,
} from '../services/savedCalls.js';

function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/** `speakerId` in a body: a speaker's id, or null for nobody. Anything else is refused. */
function speakerIdFrom(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.length > 0) return value;
  throw new AppError(400, 'speakerId must be a speaker id or null');
}

/** What the service refuses, as the status the client can act on. */
function asHttpError(error: unknown): unknown {
  if (error instanceof UnknownSpeakerError) return new AppError(404, 'Speaker not found');
  if (error instanceof AlreadySavedError) return new AppError(409, `${error.message}.`);
  return error;
}

function transformOpportunity(opp: Opportunity) {
  return {
    ...opp,
    industries: parseJsonArray(opp.industries),
    sectors: normalizeSectors(opp.sectors),
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
    const speakerId = speakerIdFrom(req.body.speakerId);

    if (!opportunityId) {
      throw new AppError(400, 'Opportunity ID is required');
    }
    if (!isSavedCategory(category)) {
      throw new AppError(400, 'Category must be interested, applied, accepted or rejected');
    }

    // Check if opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      throw new AppError(404, 'Opportunity not found');
    }

    const saved = await saveCall({ userId: req.user.userId, opportunityId, category, speakerId });

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
    next(asHttpError(error));
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
    // A stage, a speaker, or both: `speakerId: null` takes the call back to nobody.
    const movesSpeaker = 'speakerId' in req.body;

    if (category === undefined && !movesSpeaker) {
      throw new AppError(400, 'Send a category, a speakerId, or both');
    }
    if (category !== undefined && !isSavedCategory(category)) {
      throw new AppError(400, 'Category must be interested, applied, accepted or rejected');
    }

    const updated = await changeSavedCall(req.user.userId, id, {
      category,
      ...(movesSpeaker ? { speakerId: speakerIdFrom(req.body.speakerId) } : {}),
    });

    if (!updated) {
      throw new AppError(404, 'Saved opportunity not found');
    }

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
    next(asHttpError(error));
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
