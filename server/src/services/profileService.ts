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
 * The speaker profile: one row per user, read by the match score. Arrays are
 * JSON strings in the row (same convention as `Opportunity.industries`), so
 * the service owns both directions of that conversion.
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

/** Validates `PUT /api/profile`; every field is optional in the body and defaulted here. */
export const speakerProfileInputSchema = z.object({
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

/**
 * The account's profile row. Neither this nor the save below leans on the
 * unique index on `userId`: the roster (several profiles per account) drops
 * it, and a preview build pushes that schema to the production database
 * before the code that goes with it is merged. Until then the oldest row is
 * the profile.
 */
function findProfileRow(userId: string) {
  return prisma.speakerProfile.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

export async function getProfile(userId: string): Promise<SpeakerProfileWithDates | null> {
  const row = await findProfileRow(userId);
  return row ? profileFromRow(row) : null;
}

/** The profile reduced to what the score reads, or null when the user has none. */
export async function getMatchProfile(userId: string): Promise<MatchProfile | null> {
  return getProfile(userId);
}

export async function upsertProfile(userId: string, input: SpeakerProfileInput): Promise<SpeakerProfileWithDates> {
  const data = profileToData(input);
  // Not `upsert`: Prisma sends that as INSERT ... ON CONFLICT ("userId"), which
  // Postgres rejects (42P10) once no unique index covers the column.
  const existing = await findProfileRow(userId);
  const row = existing
    ? await prisma.speakerProfile.update({ where: { id: existing.id }, data })
    : await prisma.speakerProfile.create({ data: { userId, ...data } });
  return profileFromRow(row);
}
