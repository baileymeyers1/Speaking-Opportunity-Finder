/**
 * Fills or refreshes the demo's listings copy from production's public list. Run by the demo deployment's
 * build after `prisma db push` (scripts/deploy-demo.sh); the daily cron route does the same afterwards.
 * Only runs with DEMO_MODE=true, so it can never touch production's database.
 */
import { isDemoMode } from '../demo/env.js';
import { fetchPublicListings, refreshDemoListings } from '../demo/listings.js';
import { prisma } from '../lib/prisma.js';

if (!isDemoMode()) {
  console.error('demoRefreshListings runs only with DEMO_MODE=true');
  process.exit(1);
}

const result = await refreshDemoListings(prisma, { listings: await fetchPublicListings() });
console.log(`[demo] listings: ${result.listed} listed, ${result.created} added, ${result.updated} updated, ${result.removed} removed`);
await prisma.$disconnect();
