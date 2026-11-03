import { type Request, type Response, type NextFunction } from 'express';
import type {
  AdminCatalogueResponse,
  AdminDemandResponse,
  AdminEnrichmentBatchResult,
  AdminPipelineResponse,
  AdminSearchLogResponse,
  AdminSourcesResponse,
  ApiResponse,
} from 'shared';
import * as analyticsService from '../services/analyticsService.js';
import { processNextBatch } from '../services/backgroundEnrichment.js';

/** Rows per manual batch and the wall-clock it may use; well inside the 60s function limit. */
const MANUAL_BATCH_SIZE = 5;
const MANUAL_BATCH_BUDGET_MS = 25_000;

type Handler<T> = (req: Request, res: Response<ApiResponse<T>>, next: NextFunction) => Promise<void>;

function section<T>(load: () => Promise<T>): Handler<T> {
  return async (_req, res, next) => {
    try {
      res.json({ success: true, data: await load() });
    } catch (error) {
      next(error);
    }
  };
}

export const getSources: Handler<AdminSourcesResponse> = section(() => analyticsService.getSources());
export const getPipeline: Handler<AdminPipelineResponse> = section(() => analyticsService.getPipeline());
export const getCatalogue: Handler<AdminCatalogueResponse> = section(() => analyticsService.getCatalogue());
export const getDemand: Handler<AdminDemandResponse> = section(() => analyticsService.getDemand());
export const getSearchLog: Handler<AdminSearchLogResponse> = section(() => analyticsService.getSearchLogAnalytics());

/**
 * Run one enrichment batch now, the same work the 5-minute cron does, with a
 * shorter budget so the response arrives well inside the function limit.
 */
export const runEnrichmentBatch: Handler<AdminEnrichmentBatchResult> = async (_req, res, next) => {
  try {
    const startedAt = Date.now();
    const result = await processNextBatch(MANUAL_BATCH_SIZE, { timeBudgetMs: MANUAL_BATCH_BUDGET_MS });
    res.json({ success: true, data: { ...result, durationMs: Date.now() - startedAt } });
  } catch (error) {
    next(error);
  }
};
