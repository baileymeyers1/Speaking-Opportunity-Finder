import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { EARLIEST_STORABLE_YEAR, LATEST_STORABLE_YEAR } from '../lib/storableDate.js';

/**
 * One-off: clear event dates and deadlines stored outside 1900–2100.
 *
 * Postgres stores a year past 9999 but the `pg` adapter reads it back as an
 * Invalid Date, so every enrichment or verification write of such a row
 * fails (production, 2026-11-12). Writes are guarded now (lib/storableDate.ts);
 * this clears what was stored before. Raw SQL, because Prisma cannot read
 * these values. The dry run prints each row's source and URL, which shows
 * which parser produced the date.
 *
 *   npx tsx server/src/scripts/clearUnstorableDates.ts --dry-run
 *   DATABASE_URL="postgres://…" npx tsx server/src/scripts/clearUnstorableDates.ts
 */

const DRY_RUN = process.argv.includes('--dry-run');
const EARLIEST = `${EARLIEST_STORABLE_YEAR}-01-01`;
const AFTER_LATEST = `${LATEST_STORABLE_YEAR + 1}-01-01`;

interface UnstorableRow {
  id: string;
  title: string;
  source: string;
  applyUrl: string;
  eventDate: string | null;
  cfpDeadline: string | null;
}

async function main() {
  const rows = await prisma.$queryRaw<UnstorableRow[]>`
    SELECT id, title, source, "applyUrl",
      CASE WHEN "eventDate" < ${EARLIEST}::timestamp OR "eventDate" >= ${AFTER_LATEST}::timestamp
        THEN "eventDate"::text END AS "eventDate",
      CASE WHEN "cfpDeadline" < ${EARLIEST}::timestamp OR "cfpDeadline" >= ${AFTER_LATEST}::timestamp
        THEN "cfpDeadline"::text END AS "cfpDeadline"
    FROM "Opportunity"
    WHERE "eventDate" < ${EARLIEST}::timestamp OR "eventDate" >= ${AFTER_LATEST}::timestamp
       OR "cfpDeadline" < ${EARLIEST}::timestamp OR "cfpDeadline" >= ${AFTER_LATEST}::timestamp
    ORDER BY source, title`;

  console.log(`${rows.length} rows with a date outside ${EARLIEST_STORABLE_YEAR}–${LATEST_STORABLE_YEAR}`);
  for (const row of rows) {
    const dates = [row.eventDate && `eventDate ${row.eventDate}`, row.cfpDeadline && `cfpDeadline ${row.cfpDeadline}`]
      .filter(Boolean)
      .join(', ');
    console.log(`  - [${row.source}] ${row.title} (${dates}) ${row.applyUrl}`);
  }

  if (DRY_RUN || rows.length === 0) {
    if (DRY_RUN) console.log('Dry run: nothing changed.');
    return;
  }

  const events = await prisma.$executeRaw`
    UPDATE "Opportunity" SET "eventDate" = NULL
    WHERE "eventDate" < ${EARLIEST}::timestamp OR "eventDate" >= ${AFTER_LATEST}::timestamp`;
  // The zone travels with the deadline it qualifies.
  const deadlines = await prisma.$executeRaw`
    UPDATE "Opportunity" SET "cfpDeadline" = NULL, "deadlineTimezone" = NULL
    WHERE "cfpDeadline" < ${EARLIEST}::timestamp OR "cfpDeadline" >= ${AFTER_LATEST}::timestamp`;
  console.log(`Cleared ${events} event dates and ${deadlines} deadlines.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
