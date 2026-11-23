/**
 * The public demo (DEMO_MODE=true): the finder rebranded for Bailey's portfolio, on a copy of production's
 * public listings, with an account per visit and a small daily live-search allowance. See docs/DEMO.md.
 */

/** The demo's tables live in their own Postgres schema of the shared demo database. */
export const DEMO_SCHEMA = 'speaking_demo';

export const DEFAULT_DEMO_LIVE_SEARCH_DAILY_LIMIT = 25;

type Env = Record<string, string | undefined>;

export function isDemoMode(env: Env = process.env): boolean {
  return env.DEMO_MODE === 'true';
}

/**
 * The demo's own database (the Neon store connected with the "DEMO" prefix), never DATABASE_URL. The direct
 * connection is preferred: the pool sets `search_path` when it connects, which a transaction pooler drops.
 */
export function demoDatabaseUrl(env: Env = process.env): string | undefined {
  const url = (env.DEMO_DATABASE_URL_UNPOOLED || env.DEMO_DATABASE_URL)?.trim();
  return url || undefined;
}

/** Live searches the whole demo may run per UTC day (DEMO_LIVE_SEARCH_DAILY_LIMIT, default 25). */
export function demoLiveSearchDailyLimit(env: Env = process.env): number {
  const parsed = Number.parseInt(env.DEMO_LIVE_SEARCH_DAILY_LIMIT ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_DEMO_LIVE_SEARCH_DAILY_LIMIT;
}

/** Where the demo copies its listings from: production's public API. */
export function demoListingsSource(env: Env = process.env): string {
  return (env.DEMO_LISTINGS_SOURCE || 'https://speaking-opportunity-finder.vercel.app').replace(/\/+$/, '');
}
