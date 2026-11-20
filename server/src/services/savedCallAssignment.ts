/**
 * Calls saved before the roster existed belong to nobody (`speakerId` null).
 * An account that had one profile then meant that person, so a one-off pass
 * gives each such call to the account's first speaker. Pure planning here;
 * `scripts/assignSavedCalls.ts` reads the rows and writes the plan.
 */

export interface UnassignedSave {
  id: string;
  userId: string;
  opportunityId: string;
}

export interface SavedCallAssignmentPlan {
  /** Saved rows to give to a speaker. */
  assign: Array<{ id: string; speakerId: string }>;
  /** Rows whose account has nobody on its roster: they stay with nobody. */
  noSpeaker: number;
  /** Rows the first speaker already has saved in their own right: left alone, for a person to sort out. */
  alreadyTheirs: number;
}

export const savedKey = (speakerId: string, opportunityId: string) => `${speakerId}:${opportunityId}`;

/**
 * @param firstSpeakerByUser each account's first speaker (roster order), by user id
 * @param savedBySpeaker `savedKey` of every call already saved for a speaker
 */
export function planSavedCallAssignment(
  unassigned: readonly UnassignedSave[],
  firstSpeakerByUser: ReadonlyMap<string, string>,
  savedBySpeaker: ReadonlySet<string>
): SavedCallAssignmentPlan {
  const plan: SavedCallAssignmentPlan = { assign: [], noSpeaker: 0, alreadyTheirs: 0 };
  // Two unassigned rows for one call cannot both go to the speaker: the first one claims the place.
  const claimed = new Set(savedBySpeaker);

  for (const row of unassigned) {
    const speakerId = firstSpeakerByUser.get(row.userId);
    if (!speakerId) {
      plan.noSpeaker += 1;
      continue;
    }
    const key = savedKey(speakerId, row.opportunityId);
    if (claimed.has(key)) {
      plan.alreadyTheirs += 1;
      continue;
    }
    claimed.add(key);
    plan.assign.push({ id: row.id, speakerId });
  }
  return plan;
}
