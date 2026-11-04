import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { assignEvent, type AssignmentResult } from '../services/eventAssignment.js';

/**
 * One-off, idempotent: give every stored row without an event its canonical
 * `Event` (services/eventMatching.ts), oldest rows first so the first source
 * that listed a conference names it. Rows that already have an event are left
 * alone, so running twice changes nothing.
 *
 *   npx tsx server/src/scripts/backfillEvents.ts --dry-run
 *   DATABASE_URL="postgres://…" npx tsx server/src/scripts/backfillEvents.ts
 *
 * A dry run does the whole pass inside one transaction and rolls it back, so
 * its numbers are the real ones.
 */

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 200;
const LOWEST_LINKS_SHOWN = 20;
const DRY_RUN_TIMEOUT_MS = 10 * 60 * 1000;

class DryRunRollback extends Error {}

type Db = Parameters<typeof assignEvent>[0];

interface Tally {
  processed: number;
  linked: number;
  created: number;
  createdPossible: number;
  unmatchable: number;
  links: Array<AssignmentResult & { title: string; source: string }>;
}

async function counts(db: Db) {
  const [events, rows, linkedRows, possibleDuplicates] = await Promise.all([
    db.event.count(),
    db.opportunity.count(),
    db.opportunity.count({ where: { eventId: { not: null } } }),
    db.opportunity.count({ where: { possibleEventScore: { not: null } } }),
  ]);
  return { events, rows, linkedRows, possibleDuplicates };
}

async function backfill(db: Db, now: Date): Promise<Tally> {
  const tally: Tally = { processed: 0, linked: 0, created: 0, createdPossible: 0, unmatchable: 0, links: [] };
  // Rows leave the `eventId: null` set as they are stamped; the ones no event
  // fits stay in it and are excluded by id, so the loop always ends.
  const unmatchableIds: string[] = [];
  while (true) {
    const batch = await db.opportunity.findMany({
      where: { eventId: null, ...(unmatchableIds.length ? { id: { notIn: unmatchableIds } } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      select: { id: true, title: true, organization: true, applyUrl: true, eventDate: true, location: true, source: true, eventId: true },
    });
    if (batch.length === 0) break;
    for (const row of batch) {
      const result = await assignEvent(db, row, now);
      tally.processed++;
      if (result.outcome === 'linked') {
        tally.linked++;
        tally.links.push({ ...result, title: row.title, source: row.source });
      } else if (result.outcome === 'created') tally.created++;
      else if (result.outcome === 'created-possible') tally.createdPossible++;
      else {
        tally.unmatchable++;
        unmatchableIds.push(row.id);
      }
    }
    console.log(`  processed ${tally.processed}`);
  }
  return tally;
}

async function report(db: Db, tally: Tally, before: Awaited<ReturnType<typeof counts>>) {
  const after = await counts(db);
  console.log(
    `After:  ${after.events} events, ${after.linkedRows}/${after.rows} rows linked, ${after.possibleDuplicates} rows flagged as possible duplicates.`
  );
  console.log(
    `${tally.processed} rows processed: ${after.events - before.events} events created ` +
      `(${tally.createdPossible} with a possible duplicate recorded), ${tally.linked} rows linked to an existing event, ` +
      `${tally.unmatchable} rows with no usable name.`
  );
  const lowest = [...tally.links].sort((a, b) => a.score - b.score).slice(0, LOWEST_LINKS_SHOWN);
  if (lowest.length === 0) return;
  const events = await db.event.findMany({
    where: { id: { in: lowest.map((l) => l.eventId!).filter(Boolean) } },
    select: { id: true, canonicalName: true },
  });
  const nameOf = new Map(events.map((e) => [e.id, e.canonicalName]));
  console.log(`Lowest-confidence links (${lowest.length}):`);
  for (const link of lowest) {
    console.log(`  ${link.score.toFixed(3)}  "${link.title}" [${link.source}] -> "${nameOf.get(link.eventId!) ?? link.eventId}"`);
  }
}

async function main(): Promise<void> {
  const now = new Date();
  const before = await counts(prisma);
  console.log(
    `Before: ${before.events} events, ${before.linkedRows}/${before.rows} rows linked, ${before.possibleDuplicates} rows flagged as possible duplicates.`
  );

  if (DRY_RUN) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const tally = await backfill(tx, now);
          await report(tx, tally, before);
          throw new DryRunRollback('rollback');
        },
        { timeout: DRY_RUN_TIMEOUT_MS, maxWait: 10_000 }
      );
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
    }
    console.log('Dry run: nothing written.');
    return;
  }

  const tally = await backfill(prisma, now);
  await report(prisma, tally, before);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
