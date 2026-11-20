import type { SpeakerProfile } from '../types';

/** How a speaker reads in a list: the same words on the roster and, later, wherever a call is saved for someone. */

type Named = Pick<SpeakerProfile, 'name'>;
type Placed = Pick<SpeakerProfile, 'homeCity' | 'homeCountry' | 'travelRadius' | 'remotePreference'>;

/** A profile saved before the roster has no name yet. */
export const UNNAMED_SPEAKER = 'Unnamed speaker';

export function speakerName(speaker: Named): string {
  return speaker.name.trim() || UNNAMED_SPEAKER;
}

const REACH: Record<SpeakerProfile['travelRadius'], string> = {
  local: 'Home city only',
  country: 'Home country only',
  international: 'Travels anywhere',
};

/**
 * Where the speaker is and how far they go, as one line: "Lagos, Nigeria.
 * Travels anywhere". Remote only replaces the travel answer, since nothing
 * in person fits them; a preference for remote is added to it.
 */
export function speakerReach(speaker: Placed): string {
  const home = [speaker.homeCity, speaker.homeCountry].filter(Boolean).join(', ');
  const reach =
    speaker.remotePreference === 'remote_only'
      ? 'Remote only'
      : speaker.remotePreference === 'prefer_remote'
        ? `${REACH[speaker.travelRadius]}, prefers remote`
        : REACH[speaker.travelRadius];
  return home ? `${home}. ${reach}` : reach;
}

/** The topics a row has room for, and how many it leaves out. */
export function topicsPreview(topics: readonly string[], room = 4): { shown: string[]; more: number } {
  return { shown: topics.slice(0, room), more: Math.max(0, topics.length - room) };
}

/**
 * Whose fit Browse shows while there is no way to choose: the first speaker.
 * Worth saying only once there is more than one.
 */
export function fitCaption(speakers: readonly Named[]): string {
  if (speakers.length < 2) return '';
  return `Browse shows fit for ${speakerName(speakers[0])}, the first on this list.`;
}
