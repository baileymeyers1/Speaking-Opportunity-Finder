import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import type {
  CompensationRequirement,
  OpportunityFormat,
  RemotePreference,
  SpeakerProfile,
  SpeakerProfileInput,
  SpeakerSeniority,
  TravelRadius,
} from 'shared';
import type { MatchProfile } from './matchScore.js';

/**
 * The roster: the people an account places, one `SpeakerProfile` row each,
 * read by the match score. Every function takes the account's user id and
 * never reaches another account's row. Arrays are JSON strings in the row
 * (same convention as `Opportunity.industries`), so the service owns both
 * directions of that conversion.
 */

export const SENIORITIES = ['new', 'experienced', 'keynote'] as const satisfies readonly SpeakerSeniority[];
export const TRAVEL_RADII = ['local', 'country', 'international'] as const satisfies readonly TravelRadius[];
export const REMOTE_PREFERENCES = [
  'remote_only',
  'prefer_remote',
  'either',
  'prefer_in_person',
] as const satisfies readonly RemotePreference[];
export const COMPENSATION_REQUIREMENTS = ['any', 'travel_covered', 'paid'] as const satisfies readonly CompensationRequirement[];
const FORMATS = ['conference', 'meetup', 'podcast', 'webinar', 'workshop', 'panel', 'other'] as const satisfies readonly OpportunityFormat[];

export const MAX_TOPICS = 30;
export const MAX_TOPIC_LENGTH = 40;
export const MAX_BIO_LENGTH = 500;
export const MAX_NAME_LENGTH = 80;
export const MAX_TITLE_LENGTH = 120;
/** Fit is scored for every speaker on every listed call, so the roster has a ceiling. */
export const MAX_SPEAKERS = 50;

/** The account already has `MAX_SPEAKERS` speakers. */
export class SpeakerLimitError extends Error {
  constructor() {
    super(`A roster holds at most ${MAX_SPEAKERS} speakers`);
    this.name = 'SpeakerLimitError';
  }
}

const DEFAULTS = {
  seniority: 'experienced',
  travelRadius: 'international',
  remotePreference: 'either',
  compensationRequirement: 'any',
} as const;

function dedupe<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

/** Validates a speaker sent to `/api/speakers`; only the name is required, the rest is defaulted here. */
export const speakerProfileInputSchema = z.object({
  name: z.string({ error: 'Enter a name' }).trim().min(1, 'Enter a name').max(MAX_NAME_LENGTH),
  title: z.string().trim().max(MAX_TITLE_LENGTH).default(''),
  topics: z
    .array(z.string().trim().max(MAX_TOPIC_LENGTH))
    .max(MAX_TOPICS)
    .default([])
    .transform((topics) => dedupe(topics.map((topic) => topic.toLowerCase()).filter(Boolean))),
  bio: z.string().trim().max(MAX_BIO_LENGTH).default(''),
  seniority: z.enum(SENIORITIES).default(DEFAULTS.seniority),
  homeCity: optionalText(80),
  homeCountry: optionalText(80),
  travelRadius: z.enum(TRAVEL_RADII).default(DEFAULTS.travelRadius),
  remotePreference: z.enum(REMOTE_PREFERENCES).default(DEFAULTS.remotePreference),
  compensationRequirement: z.enum(COMPENSATION_REQUIREMENTS).default(DEFAULTS.compensationRequirement),
  preferredFormats: z.array(z.enum(FORMATS)).max(FORMATS.length).default([]).transform(dedupe),
});

/** What the row looks like; declared here so the parsers can be tested without Prisma. */
export interface SpeakerProfileRow {
  id: string;
  userId: string;
  name: string;
  title: string;
  topics: string;
  bio: string;
  seniority: string;
  homeCity: string | null;
  homeCountry: string | null;
  travelRadius: string;
  remotePreference: string;
  compensationRequirement: string;
  preferredFormats: string;
  createdAt: Date;
  updatedAt: Date;
}

/** The profile as the server holds it before `res.json` turns the dates into strings. */
export type SpeakerProfileWithDates = Omit<SpeakerProfile, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function profileFromRow(row: SpeakerProfileRow): SpeakerProfileWithDates {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    title: row.title,
    topics: parseStringArray(row.topics),
    bio: row.bio,
    seniority: oneOf(SENIORITIES, row.seniority, DEFAULTS.seniority),
    homeCity: row.homeCity,
    homeCountry: row.homeCountry,
    travelRadius: oneOf(TRAVEL_RADII, row.travelRadius, DEFAULTS.travelRadius),
    remotePreference: oneOf(REMOTE_PREFERENCES, row.remotePreference, DEFAULTS.remotePreference),
    compensationRequirement: oneOf(COMPENSATION_REQUIREMENTS, row.compensationRequirement, DEFAULTS.compensationRequirement),
    preferredFormats: parseStringArray(row.preferredFormats).filter((format): format is OpportunityFormat =>
      (FORMATS as readonly string[]).includes(format)
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function profileToData(input: SpeakerProfileInput) {
  return {
    name: input.name,
    title: input.title,
    topics: JSON.stringify(input.topics),
    bio: input.bio,
    seniority: input.seniority,
    homeCity: input.homeCity,
    homeCountry: input.homeCountry,
    travelRadius: input.travelRadius,
    remotePreference: input.remotePreference,
    compensationRequirement: input.compensationRequirement,
    preferredFormats: JSON.stringify(input.preferredFormats),
  };
}

/** The account's speakers, oldest first: the order the roster lists them in. */
export async function listSpeakers(userId: string): Promise<SpeakerProfileWithDates[]> {
  const rows = await prisma.speakerProfile.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return rows.map(profileFromRow);
}

/** One of the account's speakers, or null when the id is not theirs. */
export async function getSpeaker(userId: string, id: string): Promise<SpeakerProfileWithDates | null> {
  const row = await prisma.speakerProfile.findFirst({ where: { id, userId } });
  return row ? profileFromRow(row) : null;
}

/**
 * Whose fit a list is scored for when nobody was chosen: the account's first
 * speaker, or null when it has none. An account that only ever kept one
 * profile is scored exactly as before the roster.
 */
export async function getMatchProfile(userId: string): Promise<MatchProfile | null> {
  const row = await prisma.speakerProfile.findFirst({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return row ? profileFromRow(row) : null;
}

export async function createSpeaker(userId: string, input: SpeakerProfileInput): Promise<SpeakerProfileWithDates> {
  if ((await prisma.speakerProfile.count({ where: { userId } })) >= MAX_SPEAKERS) throw new SpeakerLimitError();
  const row = await prisma.speakerProfile.create({ data: { userId, ...profileToData(input) } });
  return profileFromRow(row);
}

/** Replaces one speaker's profile; null when the id is not the account's. */
export async function updateSpeaker(
  userId: string,
  id: string,
  input: SpeakerProfileInput
): Promise<SpeakerProfileWithDates | null> {
  const existing = await prisma.speakerProfile.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return null;
  const row = await prisma.speakerProfile.update({ where: { id: existing.id }, data: profileToData(input) });
  return profileFromRow(row);
}

/** Removes one speaker and, through the schema's cascade, the calls saved for them. False when the id is not the account's. */
export async function deleteSpeaker(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.speakerProfile.deleteMany({ where: { id, userId } });
  return count > 0;
}
