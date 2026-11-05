import type { DateConfidence, MatchExplanation, SpeakerProfileInput } from 'shared';

/**
 * Deterministic, explainable match between a speaker profile and one
 * opportunity. No embeddings and no model call, so it gives the same answer
 * on SQLite and Postgres and can be unit-tested exactly.
 *
 * Each component yields a fit in 0..1 and is only counted when the profile
 * says something about it (a profile with no topics is not scored on topics).
 * The weighted mean of the applicable components is blended with the row's
 * quality score, then small penalties are taken for things that make the
 * listing risky to act on. An empty profile therefore scores on quality alone.
 */

export type MatchProfile = Pick<
  SpeakerProfileInput,
  | 'topics'
  | 'seniority'
  | 'homeCity'
  | 'homeCountry'
  | 'travelRadius'
  | 'remotePreference'
  | 'compensationRequirement'
  | 'preferredFormats'
>;

/** The opportunity fields the score reads; stored rows and live results both satisfy it. */
export interface MatchCandidate {
  title: string;
  description: string | null;
  industries: string[];
  location: string | null;
  isRemote: boolean;
  format: string;
  compensationType: string | null;
  qualityScore?: number | null;
  cfpDeadline: Date | string | null;
  verifiedAt?: Date | string | null;
  dateConfidence?: DateConfidence | null;
  /** False = an event with no call for speakers found; you would have to pitch the organizer. */
  hasOpenCall?: boolean | null;
}

export type ScoredOpportunity<T> = T & {
  matchScore: number;
  matchReasons: string[];
  matchMisses: string[];
};

/** `sort=match` scores at most this many rows in memory before paginating. */
export const MATCH_SORT_CANDIDATE_CAP = 500;

const WEIGHTS = { topics: 40, location: 25, compensation: 15, format: 10 } as const;
const QUALITY_WEIGHT = 0.2;
const NEUTRAL_QUALITY = 50;
const DEADLINE_SOON_DAYS = 3;
const PENALTIES = { deadlineSoon: 10, approximateDeadline: 5, unverified: 3, noOpenCall: 15 } as const;

interface Component {
  weight: number;
  fit: number;
}

interface Assessment {
  component: Component | null;
  reasons: string[];
  misses: string[];
}

const US_ALIASES = ['united states', 'usa', 'us', 'u s', 'u s a', 'america'];
const UK_ALIASES = ['united kingdom', 'uk', 'u k', 'england', 'scotland', 'wales', 'great britain', 'britain'];
/** "Denver, CO" style locations are US; no country name is ever written on them. */
const US_STATE_SUFFIX = /,\s*[A-Z]{2}$/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Whole-word, case-insensitive match of a topic in some text, tolerating a plural. */
export function topicMatches(topic: string, text: string | null | undefined): boolean {
  const needle = normalize(topic);
  if (!needle || !text) return false;
  const haystack = ` ${normalize(text)} `;
  return haystack.includes(` ${needle} `) || haystack.includes(` ${needle}s `);
}

function assessTopics(profile: MatchProfile, row: MatchCandidate): Assessment {
  const topics = profile.topics.map((topic) => topic.trim()).filter(Boolean);
  if (topics.length === 0) return { component: null, reasons: [], misses: [] };

  const matched = topics.filter(
    (topic) =>
      row.industries.some((industry) => topicMatches(topic, industry) || topicMatches(industry, topic)) ||
      topicMatches(topic, row.title) ||
      topicMatches(topic, row.description)
  );
  // One shared topic is already a strong signal; more adds a little.
  const fit = matched.length === 0 ? 0 : matched.length === 1 ? 0.75 : matched.length === 2 ? 0.9 : 1;
  return {
    component: { weight: WEIGHTS.topics, fit },
    reasons: matched.length > 0 ? [`matches: ${matched.map((topic) => topic.toLowerCase()).join(', ')}`] : [],
    misses: matched.length === 0 ? ['no topic overlap'] : [],
  };
}

function countryMatches(location: string, homeCountry: string): boolean {
  const home = normalize(homeCountry);
  const place = normalize(location);
  if (place.includes(home)) return true;
  if (US_ALIASES.includes(home)) {
    return US_ALIASES.some((alias) => ` ${place} `.includes(` ${alias} `)) || US_STATE_SUFFIX.test(location.trim());
  }
  if (UK_ALIASES.includes(home)) {
    return UK_ALIASES.some((alias) => ` ${place} `.includes(` ${alias} `));
  }
  return false;
}

function assessRemote(profile: MatchProfile): Assessment {
  switch (profile.remotePreference) {
    case 'remote_only':
    case 'prefer_remote':
      return { component: { weight: WEIGHTS.location, fit: 1 }, reasons: ['remote'], misses: [] };
    case 'prefer_in_person':
      return { component: { weight: WEIGHTS.location, fit: 0.6 }, reasons: [], misses: ['remote, you prefer in person'] };
    default:
      return { component: { weight: WEIGHTS.location, fit: 1 }, reasons: ['remote'], misses: [] };
  }
}

function assessInPerson(profile: MatchProfile, location: string | null): Assessment {
  const weight = WEIGHTS.location;
  const where = location ? `in-person in ${location}` : 'in-person';
  if (profile.remotePreference === 'remote_only') {
    return { component: { weight, fit: 0 }, reasons: [], misses: [`${where}, you prefer remote`] };
  }
  const hasHome = Boolean(profile.homeCity || profile.homeCountry);
  if (!location) {
    // Nothing to compare against; only a stated preference says anything.
    if (profile.remotePreference === 'prefer_remote') return { component: { weight, fit: 0.5 }, reasons: [], misses: [] };
    if (profile.remotePreference === 'prefer_in_person') return { component: { weight, fit: 0.8 }, reasons: [], misses: [] };
    return { component: null, reasons: [], misses: [] };
  }
  if (!hasHome) {
    if (profile.remotePreference === 'prefer_remote') return { component: { weight, fit: 0.5 }, reasons: [], misses: [] };
    if (profile.remotePreference === 'prefer_in_person') return { component: { weight, fit: 1 }, reasons: ['in person'], misses: [] };
    return { component: null, reasons: [], misses: [] };
  }

  const sameCity = Boolean(profile.homeCity && normalize(location).includes(normalize(profile.homeCity)));
  const sameCountry = sameCity || Boolean(profile.homeCountry && countryMatches(location, profile.homeCountry));
  const soften = profile.remotePreference === 'prefer_remote' ? 0.7 : 1;

  if (sameCity) {
    return { component: { weight, fit: 1 * soften }, reasons: [`in ${profile.homeCity}`], misses: [] };
  }
  if (profile.travelRadius === 'local') {
    return { component: { weight, fit: 0.2 * soften }, reasons: [], misses: [`${where}, you only travel locally`] };
  }
  if (sameCountry) {
    const reason = profile.homeCountry ? `within ${profile.homeCountry}` : 'in your country';
    return { component: { weight, fit: 0.9 * soften }, reasons: [reason], misses: [] };
  }
  if (profile.travelRadius === 'country') {
    const outside = profile.homeCountry ? `outside ${profile.homeCountry}` : 'outside your country';
    return { component: { weight, fit: 0.1 * soften }, reasons: [], misses: [`${where}, ${outside}`] };
  }
  return { component: { weight, fit: 0.7 * soften }, reasons: [], misses: [] };
}

function assessLocation(profile: MatchProfile, row: MatchCandidate): Assessment {
  return row.isRemote ? assessRemote(profile) : assessInPerson(profile, row.location);
}

function assessCompensation(profile: MatchProfile, row: MatchCandidate): Assessment {
  const weight = WEIGHTS.compensation;
  const type = row.compensationType;
  const isPaid = type === 'paid' || type === 'honorarium';
  if (profile.compensationRequirement === 'any') return { component: null, reasons: [], misses: [] };
  if (type === null || type === undefined) return { component: { weight, fit: 0.5 }, reasons: [], misses: [] };
  if (isPaid) return { component: { weight, fit: 1 }, reasons: ['paid'], misses: [] };
  if (profile.compensationRequirement === 'travel_covered') {
    return type === 'travel'
      ? { component: { weight, fit: 1 }, reasons: ['travel covered'], misses: [] }
      : { component: { weight, fit: 0 }, reasons: [], misses: ['exposure only, you need travel covered'] };
  }
  return type === 'travel'
    ? { component: { weight, fit: 0.3 }, reasons: [], misses: ['travel only, you need a paid slot'] }
    : { component: { weight, fit: 0 }, reasons: [], misses: ['unpaid, you need a paid slot'] };
}

function assessFormat(profile: MatchProfile, row: MatchCandidate): Assessment {
  const preferred = profile.preferredFormats;
  if (preferred.length === 0) return { component: null, reasons: [], misses: [] };
  if ((preferred as string[]).includes(row.format)) {
    return { component: { weight: WEIGHTS.format, fit: 1 }, reasons: [`${row.format} format`], misses: [] };
  }
  return {
    component: { weight: WEIGHTS.format, fit: 0 },
    reasons: [],
    misses: [`${row.format}, you prefer ${preferred.join(' or ')}`],
  };
}

function daysUntil(date: Date | string, now: Date): number {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function assessRisk(row: MatchCandidate, now: Date): { penalty: number; misses: string[] } {
  let penalty = 0;
  const misses: string[] = [];
  if (row.cfpDeadline) {
    const days = daysUntil(row.cfpDeadline, now);
    if (!Number.isNaN(days) && days <= DEADLINE_SOON_DAYS) {
      penalty += PENALTIES.deadlineSoon;
      misses.push(days <= 0 ? 'deadline passed' : `deadline in ${days} day${days === 1 ? '' : 's'}`);
    }
  }
  if (row.cfpDeadline && row.dateConfidence?.cfpDeadline === 'low') {
    penalty += PENALTIES.approximateDeadline;
    misses.push('deadline is approximate');
  }
  if (!row.verifiedAt) {
    penalty += PENALTIES.unverified;
    misses.push('not yet verified');
  }
  if (row.hasOpenCall === false) {
    penalty += PENALTIES.noOpenCall;
    misses.push('no open call found');
  }
  return { penalty, misses };
}

export function computeMatchScore(profile: MatchProfile, row: MatchCandidate, now: Date = new Date()): MatchExplanation {
  const assessments = [
    assessTopics(profile, row),
    assessLocation(profile, row),
    assessCompensation(profile, row),
    assessFormat(profile, row),
  ];
  const components = assessments.flatMap((assessment) => (assessment.component ? [assessment.component] : []));
  const quality = Math.min(100, Math.max(0, row.qualityScore ?? NEUTRAL_QUALITY));

  let blended: number;
  if (components.length === 0) {
    blended = quality;
  } else {
    const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
    const fit = components.reduce((sum, component) => sum + component.weight * component.fit, 0) / totalWeight;
    blended = (1 - QUALITY_WEIGHT) * fit * 100 + QUALITY_WEIGHT * quality;
  }

  const risk = assessRisk(row, now);
  const score = Math.min(100, Math.max(0, Math.round(blended) - risk.penalty));
  return {
    score,
    reasons: assessments.flatMap((assessment) => assessment.reasons),
    misses: [...assessments.flatMap((assessment) => assessment.misses), ...risk.misses],
  };
}

function deadlineTime(date: Date | string | null): number {
  if (!date) return Number.MAX_SAFE_INTEGER;
  const time = new Date(date).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

/** Score every item; with `sort`, best match first and sooner deadline on ties. */
export function scoreOpportunities<T extends MatchCandidate>(
  profile: MatchProfile,
  items: T[],
  now: Date = new Date(),
  options: { sort?: boolean } = {}
): ScoredOpportunity<T>[] {
  const scored = items.map((item) => {
    const match = computeMatchScore(profile, item, now);
    return { ...item, matchScore: match.score, matchReasons: match.reasons, matchMisses: match.misses };
  });
  if (options.sort) {
    scored.sort((a, b) => b.matchScore - a.matchScore || deadlineTime(a.cfpDeadline) - deadlineTime(b.cfpDeadline));
  }
  return scored;
}
