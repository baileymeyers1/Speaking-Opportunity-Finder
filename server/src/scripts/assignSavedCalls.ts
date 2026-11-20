import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { planSavedCallAssignment, savedKey } from '../services/savedCallAssignment.js';

/**
 * One-off, idempotent: calls saved before the roster existed belong to nobody.
 * Give each to its account's first speaker (the profile the account had then).
 * Accounts with nobody on the roster are left alone, and so is a call the
 * speaker already has saved. Running it twice changes nothing.
 *
 *   npx tsx server/src/scripts/assignSavedCalls.ts --dry-run
 *   DATABASE_URL="postgres://…" npx tsx server/src/scripts/assignSavedCalls.ts
 *
 * The dry run prints what a real run would write. A call saved for nobody
 * after the roster shipped is given away too, so run this once, soon after:
 * later, the Saved page's row menu is the way to give a call to someone.
 */

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const [unassigned, speakers, assigned] = await Promise.all([
    prisma.savedOpportunity.findMany({
      where: { speakerId: null },
      select: { id: true, userId: true, opportunityId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.speakerProfile.findMany({ select: { id: true, userId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    prisma.savedOpportunity.findMany({ where: { speakerId: { not: null } }, select: { speakerId: true, opportunityId: true } }),
  ]);

  // Roster order is oldest first, so the first row seen for a user is their first speaker.
  const firstSpeakerByUser = new Map<string, string>();
  for (const speaker of speakers) if (!firstSpeakerByUser.has(speaker.userId)) firstSpeakerByUser.set(speaker.userId, speaker.id);
  const savedBySpeaker = new Set(assigned.flatMap((row) => (row.speakerId ? [savedKey(row.speakerId, row.opportunityId)] : [])));

  const plan = planSavedCallAssignment(unassigned, firstSpeakerByUser, savedBySpeaker);
  console.log(`${unassigned.length} saved calls belong to nobody.`);
  console.log(
    `${plan.assign.length} ${DRY_RUN ? 'would go' : 'go'} to their account's first speaker; ` +
      `${plan.noSpeaker} stay (the account has no speakers); ` +
      `${plan.alreadyTheirs} stay (the speaker already has the call saved).`
  );

  if (DRY_RUN) {
    console.log('Dry run: nothing written.');
    return;
  }
  for (const { id, speakerId } of plan.assign) {
    await prisma.savedOpportunity.update({ where: { id }, data: { speakerId } });
  }
  console.log(`${plan.assign.length} saved calls updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
