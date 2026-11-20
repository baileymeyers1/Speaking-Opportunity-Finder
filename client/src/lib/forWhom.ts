import type { SavedOpportunity, SpeakerFit, SpeakerProfile } from '../types';
import { speakerName } from './speakerDisplay';

/**
 * "For whom": the one choice Browse and Saved share once an account has more
 * than one speaker. Everyone, one speaker, or (on Saved only) the calls saved
 * for nobody yet. Pure rules here; `hooks/useForWhom.ts` remembers the choice.
 */

export const EVERYONE = 'everyone';
export const NOBODY = 'nobody';
/** `EVERYONE`, `NOBODY`, or a speaker's id. */
export type ForWhom = string;

type RosterEntry = Pick<SpeakerProfile, 'id' | 'name'>;

/** The picker is only worth showing when there is someone to choose between. */
export function hasChoice(speakers: readonly RosterEntry[]): boolean {
  return speakers.length > 1;
}

/**
 * What a remembered choice means on this roster: a speaker who has since been
 * removed, or "nobody" on a page that has no such list, reads as everyone.
 */
export function resolveForWhom(
  stored: string | null | undefined,
  speakers: readonly RosterEntry[],
  options: { allowNobody?: boolean } = {}
): ForWhom {
  if (!hasChoice(speakers)) return EVERYONE;
  if (stored === NOBODY) return options.allowNobody ? NOBODY : EVERYONE;
  return speakers.some((speaker) => speaker.id === stored) ? (stored as string) : EVERYONE;
}

/** The `speaker` a list is asked for: an id when one person is chosen, nothing for everyone. */
export function speakerParam(choice: ForWhom): string | undefined {
  return choice === EVERYONE || choice === NOBODY ? undefined : choice;
}

/**
 * Who a save from a list goes to without asking: the chosen speaker; the only
 * speaker on a roster of one; nobody on an empty roster. With everyone chosen
 * on a roster of several, the save has to ask (`'ask'`).
 */
export function saveTarget(choice: ForWhom, speakers: readonly RosterEntry[]): { speakerId: string | null } | 'ask' {
  if (speakers.length === 0) return { speakerId: null };
  if (speakers.length === 1) return { speakerId: speakers[0].id };
  const chosen = speakerParam(choice);
  return chosen ? { speakerId: chosen } : 'ask';
}

/** The saved calls a choice lists: everyone's, one speaker's, or those saved for nobody. */
export function savedFor<Item extends Pick<SavedOpportunity, 'speakerId'>>(items: readonly Item[], choice: ForWhom): Item[] {
  if (choice === EVERYONE) return [...items];
  if (choice === NOBODY) return items.filter((item) => item.speakerId === null);
  return items.filter((item) => item.speakerId === choice);
}

export const NOBODY_LABEL = 'No one yet';

/** The name a saved call's speaker goes by; a speaker no longer on the roster cannot happen (their saves go with them). */
export function savedForLabel(speakerId: string | null, speakers: readonly RosterEntry[]): string {
  if (speakerId === null) return NOBODY_LABEL;
  const speaker = speakers.find((item) => item.id === speakerId);
  return speaker ? speakerName(speaker) : NOBODY_LABEL;
}

export interface NamedFit extends SpeakerFit {
  name: string;
}

/** A call's fits with the roster's names on them, in the order the server ranked them (best first). */
export function namedFits(fits: readonly SpeakerFit[] | undefined, speakers: readonly RosterEntry[]): NamedFit[] {
  if (!fits) return [];
  return fits.flatMap((fit) => {
    const speaker = speakers.find((item) => item.id === fit.speakerId);
    return speaker ? [{ ...fit, name: speakerName(speaker) }] : [];
  });
}

/**
 * One line on why a speaker does or does not fit: the first two reasons, or
 * failing any, the first thing that does not fit. Empty until the reasons
 * have arrived (a list row carries the scores alone).
 */
export function fitSummary(fit: Pick<SpeakerFit, 'reasons' | 'misses'>): string {
  const reasons = fit.reasons ?? [];
  if (reasons.length > 0) return reasons.slice(0, 2).join('; ');
  return fit.misses?.[0] ?? '';
}

/** Speakers in the order a "save for" menu lists them: best fit first, then the rest in roster order. */
export function speakersByFit<Speaker extends RosterEntry>(
  speakers: readonly Speaker[],
  fits: readonly SpeakerFit[] | undefined
): Array<{ speaker: Speaker; score: number | null }> {
  const scoreOf = new Map((fits ?? []).map((fit) => [fit.speakerId, fit.score]));
  return speakers
    .map((speaker, index) => ({ speaker, score: scoreOf.get(speaker.id) ?? null, index }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.index - b.index)
    .map(({ speaker, score }) => ({ speaker, score }));
}

/** "4 interested, 2 applied": what is saved for one speaker, stage by stage, skipping empty stages. */
export function savedSummary(items: readonly Pick<SavedOpportunity, 'category' | 'speakerId'>[], speakerId: string): string {
  const stages = ['interested', 'applied', 'accepted', 'rejected'] as const;
  const mine = items.filter((item) => item.speakerId === speakerId);
  const parts = stages.flatMap((stage) => {
    const count = mine.filter((item) => item.category === stage).length;
    return count > 0 ? [`${count} ${stage}`] : [];
  });
  return parts.length > 0 ? parts.join(', ') : 'Nothing saved';
}
