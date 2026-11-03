import type {
  CompensationRequirement,
  RemotePreference,
  SpeakerProfile,
  SpeakerProfileInput,
  SpeakerSeniority,
  TravelRadius,
} from '../types';

export interface ProfileOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

export const SENIORITY_OPTIONS: ReadonlyArray<ProfileOption<SpeakerSeniority>> = [
  { value: 'new', label: 'New speaker', description: 'A few talks or none yet' },
  { value: 'experienced', label: 'Experienced', description: 'Regular conference and meetup talks' },
  { value: 'keynote', label: 'Keynote', description: 'Invited keynotes and headline slots' },
];

export const TRAVEL_RADIUS_OPTIONS: ReadonlyArray<ProfileOption<TravelRadius>> = [
  { value: 'local', label: 'My city only', description: 'Events in your home city' },
  { value: 'country', label: 'My country', description: 'Anywhere in your home country' },
  { value: 'international', label: 'Anywhere', description: 'International travel is fine' },
];

export const REMOTE_PREFERENCE_OPTIONS: ReadonlyArray<ProfileOption<RemotePreference>> = [
  { value: 'remote_only', label: 'Remote only', description: 'In-person events score zero on location' },
  { value: 'prefer_remote', label: 'Prefer remote', description: 'In-person events are fine but rank lower' },
  { value: 'either', label: 'Either', description: 'No preference' },
  { value: 'prefer_in_person', label: 'Prefer in person', description: 'Remote events rank a little lower' },
];

export const COMPENSATION_REQUIREMENT_OPTIONS: ReadonlyArray<ProfileOption<CompensationRequirement>> = [
  { value: 'any', label: 'Anything', description: 'Compensation does not affect the score' },
  { value: 'travel_covered', label: 'Travel covered', description: 'At least travel and lodging' },
  { value: 'paid', label: 'Paid', description: 'A fee or honorarium' },
];

export const MAX_TOPICS = 30;
export const MAX_TOPIC_LENGTH = 40;
export const MAX_BIO_LENGTH = 500;

export const EMPTY_PROFILE: SpeakerProfileInput = {
  topics: [],
  bio: '',
  seniority: 'experienced',
  homeCity: null,
  homeCountry: null,
  travelRadius: 'international',
  remotePreference: 'either',
  compensationRequirement: 'any',
  preferredFormats: [],
};

/** The editable part of a stored profile, as the form holds it. */
export function profileToInput(profile: SpeakerProfile | null | undefined): SpeakerProfileInput {
  if (!profile) return EMPTY_PROFILE;
  return {
    topics: profile.topics,
    bio: profile.bio,
    seniority: profile.seniority,
    homeCity: profile.homeCity,
    homeCountry: profile.homeCountry,
    travelRadius: profile.travelRadius,
    remotePreference: profile.remotePreference,
    compensationRequirement: profile.compensationRequirement,
    preferredFormats: profile.preferredFormats,
  };
}
