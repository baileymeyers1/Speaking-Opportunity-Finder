import { prisma } from '../lib/prisma.js';
import { utcDateKey } from '../services/enrichmentBudget.js';
import { demoLiveSearchDailyLimit } from './env.js';

/**
 * The demo's live searches run on production's Linkup and Claude keys, so the whole demo gets a small
 * allowance per UTC day (DEMO_LIVE_SEARCH_DAILY_LIMIT, 25 by default), counted in the demo's database so
 * every instance shares it. Kept in EnrichmentUsage under its own key, apart from the enrichment budget's.
 */

export const DEMO_SEARCH_KEY_PREFIX = 'demo-live-search:';

export interface DemoSearchClaim {
  allowed: boolean;
  /** Searches left today after this one. */
  left: number;
}

/** Counts one live search against today's allowance; refused once it is spent. */
export async function claimDemoLiveSearch(
  now: Date = new Date(),
  limit: number = demoLiveSearchDailyLimit()
): Promise<DemoSearchClaim> {
  if (limit <= 0) return { allowed: false, left: 0 };
  const date = `${DEMO_SEARCH_KEY_PREFIX}${utcDateKey(now)}`;
  const { count } = await prisma.enrichmentUsage.upsert({
    where: { date },
    create: { date, count: 1 },
    update: { count: { increment: 1 } },
  });
  return count > limit ? { allowed: false, left: 0 } : { allowed: true, left: limit - count };
}
