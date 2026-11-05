import 'dotenv/config';
import { prisma } from '../lib/prisma.js';

/**
 * One-off: queue search hits that the old extraction rule hid for a fresh
 * read. Before `hasOpenCall` existed, an upcoming event whose page asked for
 * no speakers (an attendee page) was marked `isRelevant: false` and hidden
 * like an article. Re-reading puts it back as a listed event flagged "No open
 * call", or keeps it hidden if it really is an article.
 *
 * Only rows from the web searches (live search and the daily Linkup run),
 * read and judged not relevant, not closed. They keep `isRelevant: false`, so
 * they stay hidden until the worker re-reads them; each re-read is one Claude
 * call under the daily limit.
 *
 *   npx tsx server/src/scripts/requeueHiddenEvents.ts --dry-run
 *   DATABASE_URL="postgres://…" npx tsx server/src/scripts/requeueHiddenEvents.ts
 */

const DRY_RUN = process.argv.includes('--dry-run');
const SEARCH_SOURCES = ['Live Search', 'Linkup Search'];

async function main() {
  const where = {
    source: { in: SEARCH_SOURCES },
    enrichmentStatus: 'enriched',
    isRelevant: false,
    isClosed: false,
  };
  const rows = await prisma.opportunity.findMany({ where, select: { title: true, source: true }, orderBy: { createdAt: 'desc' } });
  const bySource = SEARCH_SOURCES.map((source) => `${source}: ${rows.filter((row) => row.source === source).length}`);
  console.log(`${rows.length} hidden search hits to re-read (${bySource.join(', ')})`);
  rows.slice(0, 15).forEach((row) => console.log(`  - ${row.title}`));

  if (DRY_RUN) {
    console.log('Dry run: nothing changed.');
    return;
  }
  const { count } = await prisma.opportunity.updateMany({
    where,
    data: { enrichmentStatus: null, enrichedAt: null, enrichmentError: null, enrichmentAttempts: 0, enrichmentClaimedAt: null },
  });
  console.log(`Queued ${count} rows for the enrichment worker.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
