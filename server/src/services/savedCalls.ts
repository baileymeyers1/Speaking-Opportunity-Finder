import type { SavedCategory } from 'shared';
import { prisma } from '../lib/prisma.js';
import { getSpeaker } from './speakerService.js';

/**
 * Saving a call, for a speaker on the account's roster or for nobody yet. One
 * row per account, call and speaker (no speaker counts as one) is this file's
 * promise: no constraint in the database makes it (the schema says why), so
 * every save and every move goes through here.
 */

export const SAVED_CATEGORIES = ['interested', 'applied', 'accepted', 'rejected'] as const satisfies readonly SavedCategory[];

export function isSavedCategory(value: unknown): value is SavedCategory {
  return typeof value === 'string' && (SAVED_CATEGORIES as readonly string[]).includes(value);
}

/** The speaker named is not on the account's roster. */
export class UnknownSpeakerError extends Error {
  constructor() {
    super('Speaker not found');
    this.name = 'UnknownSpeakerError';
  }
}

/** The call is already saved for the speaker it was being moved to. */
export class AlreadySavedError extends Error {
  constructor() {
    super('This call is already saved for that speaker');
    this.name = 'AlreadySavedError';
  }
}

export interface SaveCallInput {
  userId: string;
  opportunityId: string;
  category: SavedCategory;
  /** Who the call is saved for; null when nobody was chosen. */
  speakerId?: string | null;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Two changes to one account's saves of one call take turns: the lock is held
 * to the end of the transaction, so a double click or a second tab cannot
 * leave two rows. $executeRaw, not $queryRaw: the function returns void, which
 * Prisma cannot read back as a column.
 */
function takeTurn(tx: Tx, userId: string, opportunityId: string) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`saved:${userId}:${opportunityId}`}))`;
}

async function assertOnRoster(userId: string, speakerId: string | null) {
  if (speakerId && !(await getSpeaker(userId, speakerId))) throw new UnknownSpeakerError();
}

/**
 * Saves the call for the speaker (or for nobody), or moves it to `category`
 * when it is already saved for them.
 */
export async function saveCall({ userId, opportunityId, category, speakerId = null }: SaveCallInput) {
  await assertOnRoster(userId, speakerId);
  return prisma.$transaction(async (tx) => {
    await takeTurn(tx, userId, opportunityId);
    const existing = await tx.savedOpportunity.findFirst({
      where: { userId, opportunityId, speakerId },
      select: { id: true },
    });
    return existing
      ? tx.savedOpportunity.update({ where: { id: existing.id }, data: { category }, include: { opportunity: true } })
      : tx.savedOpportunity.create({ data: { userId, opportunityId, category, speakerId }, include: { opportunity: true } });
  });
}

export interface SavedCallChange {
  category?: SavedCategory;
  /** Present (null included) to give the call to another speaker, or to nobody. */
  speakerId?: string | null;
}

/**
 * Moves a saved call to another stage, another speaker, or both. Null when
 * the row is not the account's. Giving it to a speaker who already has the
 * call saved is refused rather than merged: their row has a stage of its own.
 */
export async function changeSavedCall(userId: string, id: string, change: SavedCallChange) {
  if (change.speakerId !== undefined) await assertOnRoster(userId, change.speakerId);
  const row = await prisma.savedOpportunity.findFirst({ where: { id, userId }, select: { opportunityId: true } });
  if (!row) return null;

  return prisma.$transaction(async (tx) => {
    await takeTurn(tx, userId, row.opportunityId);
    const current = await tx.savedOpportunity.findFirst({ where: { id, userId }, select: { speakerId: true } });
    if (!current) return null;
    if (change.speakerId !== undefined && change.speakerId !== current.speakerId) {
      const taken = await tx.savedOpportunity.findFirst({
        where: { userId, opportunityId: row.opportunityId, speakerId: change.speakerId },
        select: { id: true },
      });
      if (taken) throw new AlreadySavedError();
    }
    return tx.savedOpportunity.update({
      where: { id },
      data: {
        ...(change.category ? { category: change.category } : {}),
        ...(change.speakerId !== undefined ? { speakerId: change.speakerId } : {}),
      },
      include: { opportunity: true },
    });
  });
}
