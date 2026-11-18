import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { mapWithConcurrency } from '../scrapers/lib/html.js';
import { buildOpportunityWhere } from '../services/opportunityQuery.js';
import { formatSectorSummary, planSectorBackfill, summarizeSectors, type BackfillRow } from '../services/sectorBackfill.js';

/**
 * One-off, idempotent: give every stored row that has no sector the one or
 * two sectors its free-text tags point to (services/sectorMapping.ts). No
 * Claude call. Rows that already have a sector are left alone, so sectors
 * Claude assigned are never replaced and running twice changes nothing.
 *
 *   npx tsx server/src/scripts/backfillSectors.ts --dry-run
 *   DATABASE_URL="postgres://…" npx tsx server/src/scripts/backfillSectors.ts
 *
 * The dry run prints what a real run would write: rows changed, the sector
 * distribution afterwards (all rows, then the rows a visitor sees) and the
 * rows left without a sector. Run it against production only once the branch
 * that adds the column is on `main`: until then one written row fails the
 * `prisma db push` of every other branch's build (docs/STATUS.md, Deploy Gotchas).
 */

const DRY_RUN = process.argv.includes('--dry-run');
const READ_BATCH = 1000;
const WRITE_CONCURRENCY = 10;
const UNKNOWN_TAGS_SHOWN = 25;

async function readRows(): Promise<BackfillRow[]> {
  const rows: BackfillRow[] = [];
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.opportunity.findMany({
      select: { id: true, industries: true, sectors: true },
      orderBy: { id: 'asc' },
      take: READ_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    rows.push(...batch);
    if (batch.length < READ_BATCH) return rows;
    cursor = batch[batch.length - 1].id;
  }
}

async function main(): Promise<void> {
  const [rows, listed] = await Promise.all([
    readRows(),
    prisma.opportunity.findMany({ where: buildOpportunityWhere({}), select: { id: true } }),
  ]);
  const plan = planSectorBackfill(rows);
  const before = rows.length - plan.updates.length - plan.untagged - plan.unplaced;

  console.log(`${rows.length} rows stored; ${before} already have a sector.`);
  console.log(
    `${plan.updates.length} rows ${DRY_RUN ? 'would get' : 'get'} sectors from their tags; ` +
      `${plan.untagged + plan.unplaced} stay without one (${plan.untagged} have no tags, ` +
      `${plan.unplaced} have tags no sector matches).`
  );
  console.log('');
  console.log(formatSectorSummary('All rows afterwards', summarizeSectors(rows.map((row) => row.id), plan.after)));
  console.log('');
  console.log(formatSectorSummary('Listed rows afterwards', summarizeSectors(listed.map((row) => row.id), plan.after)));

  if (plan.unknownTags.length > 0) {
    console.log('');
    console.log(`Tags on the unplaced rows that the mapping knows no word of (top ${UNKNOWN_TAGS_SHOWN}):`);
    console.log(
      '  ' +
        plan.unknownTags
          .slice(0, UNKNOWN_TAGS_SHOWN)
          .map((entry) => (entry.count > 1 ? `${entry.tag} (${entry.count})` : entry.tag))
          .join('; ')
    );
  }

  if (DRY_RUN) {
    console.log('');
    console.log('Dry run: nothing written.');
    return;
  }

  // Raw SQL on purpose. It leaves `updatedAt` alone (the admin's "closed this
  // week" reads it), and the guard keeps a sector that enrichment wrote while
  // this script was running.
  const counts = await mapWithConcurrency(
    plan.updates,
    WRITE_CONCURRENCY,
    (update) => prisma.$executeRaw`
      UPDATE "Opportunity" SET "sectors" = ${update.sectors}::text[]
      WHERE id = ${update.id} AND ("sectors" IS NULL OR cardinality("sectors") = 0)`
  );
  const written = counts.reduce((total, count) => total + count, 0);
  console.log('');
  console.log(`Wrote sectors to ${written} rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
