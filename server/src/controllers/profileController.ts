import { type Request, type Response, type NextFunction } from 'express';
import * as profileService from '../services/profileService.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ApiResponse } from 'shared';

type ProfilePayload = ApiResponse<profileService.SpeakerProfileWithDates | null>;

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Authentication required');
    const profile = await profileService.getProfile(req.user.userId);
    const payload: ProfilePayload = { success: true, data: profile };
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function putProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Authentication required');
    const parsed = profileService.speakerProfileInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      throw new AppError(400, `Invalid profile. ${field}${issue.message}`);
    }
    const profile = await profileService.upsertProfile(req.user.userId, parsed.data);
    const payload: ProfilePayload = { success: true, data: profile };
    res.json(payload);
  } catch (error) {
    next(error);
  }
}
