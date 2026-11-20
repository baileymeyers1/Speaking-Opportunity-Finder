import type { SavedCategory } from 'shared';
import { prisma } from '../lib/prisma.js';

/**
 * Saving a call. One row per account, call and speaker (no speaker counts as
 * one) is this file's promise: no constraint in the database makes it (the
 * schema says why), so every save goes through `saveCall`.
 */

export const SAVED_CATEGORIES = ['interested', 'applied', 'accepted', 'rejected'] as const satisfies readonly SavedCategory[];

export function isSavedCategory(value: unknown): value is SavedCategory {
  return typeof value === 'string' && (SAVED_CATEGORIES as readonly string[]).includes(value);
}

export interface SaveCallInput {
  userId: string;
  opportunityId: string;
  category: SavedCategory;
  /** Who the call is saved for; null when nobody was chosen. */
  speakerId?: string | null;
}

/**
 * Saves the call, or moves it to `category` when it is already saved for the
 * same speaker. Two saves of one call take turns on an advisory lock held to
 * the end of the transaction, so a double click or a second tab cannot leave
 * two rows.
 */
export async function saveCall({ userId, opportunityId, category, speakerId = null }: SaveCallInput) {
  return prisma.$transaction(async (tx) => {
    // $executeRaw, not $queryRaw: the function returns void, which Prisma cannot read back as a column.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`saved:${userId}:${opportunityId}`}))`;
    const existing = await tx.savedOpportunity.findFirst({
      where: { userId, opportunityId, speakerId },
      select: { id: true },
    });
    return existing
      ? tx.savedOpportunity.update({ where: { id: existing.id }, data: { category }, include: { opportunity: true } })
      : tx.savedOpportunity.create({ data: { userId, opportunityId, category, speakerId }, include: { opportunity: true } });
  });
}
