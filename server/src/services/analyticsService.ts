/**
 * Admin analytics, one module per dashboard section:
 * - `analytics/sources.ts`: per-scraper run health and row counts
 * - `analytics/pipeline.ts`: enrichment and verification queues, budget, cron liveness, recent events
 * - `analytics/catalogue.ts`: what the active catalogue looks like
 * - `analytics/demand.ts`: what users save; `analytics/searchLog.ts`: what they search for live
 */
export { getSources } from './analytics/sources.js';
export { getPipeline } from './analytics/pipeline.js';
export { getCatalogue } from './analytics/catalogue.js';
export { getDemand } from './analytics/demand.js';
export { getSearchLogAnalytics } from './analytics/searchLog.js';
