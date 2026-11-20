import { type Request, type Response, type NextFunction } from 'express';
import * as speakerService from '../services/speakerService.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ApiResponse, SpeakerProfileInput } from 'shared';

type Speaker = speakerService.SpeakerProfileWithDates;

function accountOf(req: Request): string {
  if (!req.user) throw new AppError(401, 'Authentication required');
  return req.user.userId;
}

/** The body as a speaker, or a 400 naming the first field that is wrong. */
function speakerFrom(body: unknown): SpeakerProfileInput {
  const parsed = speakerService.speakerProfileInputSchema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  throw new AppError(400, `Invalid speaker. ${field}${issue.message}`);
}

export async function listSpeakers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload: ApiResponse<Speaker[]> = { success: true, data: await speakerService.listSpeakers(accountOf(req)) };
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function createSpeaker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const speaker = await speakerService.createSpeaker(accountOf(req), speakerFrom(req.body));
    const payload: ApiResponse<Speaker> = { success: true, data: speaker };
    res.status(201).json(payload);
  } catch (error) {
    next(error instanceof speakerService.SpeakerLimitError ? new AppError(400, `${error.message}.`) : error);
  }
}

export async function updateSpeaker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const speaker = await speakerService.updateSpeaker(accountOf(req), req.params.id, speakerFrom(req.body));
    if (!speaker) throw new AppError(404, 'Speaker not found');
    const payload: ApiResponse<Speaker> = { success: true, data: speaker };
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function deleteSpeaker(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const removed = await speakerService.deleteSpeaker(accountOf(req), req.params.id);
    if (!removed) throw new AppError(404, 'Speaker not found');
    res.json({ success: true, message: 'Speaker removed' });
  } catch (error) {
    next(error);
  }
}
