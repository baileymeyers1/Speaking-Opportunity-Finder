import { Request, Response, NextFunction } from 'express';
import * as analyticsService from '../services/analyticsService.js';

export async function getAnalytics(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const analytics = await analyticsService.getAllAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
}

export async function getScraperHealth(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const health = await analyticsService.getScraperHealth();

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSourceQuality(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const quality = await analyticsService.getSourceQuality();

    res.json({
      success: true,
      data: quality,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDatabaseStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await analyticsService.getDatabaseStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

export async function getLiveSearchAnalytics(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const analytics = await analyticsService.getLiveSearchAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSystemHealth(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const health = await analyticsService.getSystemHealth();

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    next(error);
  }
}
