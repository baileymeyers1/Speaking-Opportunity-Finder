import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { AOE, calendarDate, endOfDayInZone, isLegacyMidnightDeadline } from '../lib/deadlines.js';

/**
 * One-off, idempotent: rows written before deadlines carried a timezone hold
 * midnight UTC of the closing day and no `deadlineTimezone`. Rewrite each to
 * the end of that day Anywhere on Earth (11:59:59 UTC the next day) and stamp
 * the zone, so the stored instant means what the page meant. Rows that already
 * carry a zone, or a time of day, are left alone; running twice changes nothing.
 *
 *   npx tsx server/src/scripts/shiftLegacyDeadlines.ts --dry-run
 *   DATABASE_URL="postgres://…" npx tsx server/src/scripts/shiftLegacyDeadlines.ts
 */

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 200;
const SAMPLE_SIZE = 5;

async function countByShape() {
  const [withDeadline, withZone, noZone] = await Promise.all([
    prisma.opportunity.count({ where: { cfpDeadline: { not: null } } }),
    prisma.opportunity.count({ where: { cfpDeadline: { not: null }, deadlineTimezone: { not: null } } }),
    prisma.opportunity.count({ where: { cfpDeadline: { not: null }, deadlineTimezone: null } }),
  ]);
  return { withDeadline, withZone, noZone };
}

async function main(): Promise<void> {
  const before = await countByShape();
  console.log(
    `Before: ${before.withDeadline} rows with a deadline, ${before.withZone} with a timezone, ${before.noZone} without one.`
  );

  const candidates = await prisma.opportunity.findMany({
    where: { cfpDeadline: { not: null }, deadlineTimezone: null },
    select: { id: true, title: true, cfpDeadline: true, deadlineTimezone: true },
    orderBy: { id: 'asc' },
  });
  const legacy = candidates.filter(isLegacyMidnightDeadline);
  const keptAsIs = candidates.length - legacy.length;
  console.log(
    `${legacy.length} of those are stored as UTC midnight (legacy calendar days) and will move to ${AOE} end of day; ${keptAsIs} already carry a time of day and stay as they are.`
  );

  for (const row of legacy.slice(0, SAMPLE_SIZE)) {
    const shifted = endOfDayInZone(calendarDate(row.cfpDeadline!), AOE);
    console.log(`  ${row.cfpDeadline!.toISOString()} -> ${shifted?.toISOString()}  ${row.title.slice(0, 60)}`);
  }

  if (DRY_RUN) {
    console.log('Dry run: nothing written.');
    return;
  }

  let updated = 0;
  for (let offset = 0; offset < legacy.length; offset += BATCH_SIZE) {
    const batch = legacy.slice(offset, offset + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((row) =>
        prisma.opportunity.update({
          where: { id: row.id },
          data: { cfpDeadline: endOfDayInZone(calendarDate(row.cfpDeadline!), AOE), deadlineTimezone: AOE },
        })
      )
    );
    updated += batch.length;
    console.log(`  updated ${updated}/${legacy.length}`);
  }

  const after = await countByShape();
  console.log(
    `After: ${after.withDeadline} rows with a deadline, ${after.withZone} with a timezone, ${after.noZone} without one. ${updated} rows rewritten.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
