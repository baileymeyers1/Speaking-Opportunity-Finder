/**
 * Pure matching of opportunity rows to canonical events: the same conference
 * arriving from several sources with different URLs, and again next year.
 *
 * No I/O here. `eventAssignment.ts` runs the database side (candidate lookup,
 * create or link); `scripts/backfillEvents.ts` applies it to existing rows.
 *
 * Scores are 0..1. A pair at or above `AUTO_LINK_SCORE` is the same event; a
 * pair in [`REVIEW_SCORE`, `AUTO_LINK_SCORE`) is recorded as a possible
 * duplicate for the admin dashboard and left unlinked. There is deliberately
 * no model call for the middle band: the one Claude prompt extracts a page,
 * and a same-event question does not fit into it without a second prompt.
 */

/** A row (or event edition) as the scorer sees it. */
export interface MatchCandidate {
  title: string;
  organization: string | null;
  applyUrl: string;
  eventDate: Date | null;
  location: string | null;
}

export const AUTO_LINK_SCORE = 0.8;
export const REVIEW_SCORE = 0.55;
/**
 * Below this name similarity a pair can never auto-link, however much the
 * domain, organizer, dates and city agree: one organizer runs several
 * differently named conferences at the same venue on the same days.
 */
export const AUTO_NAME_FLOOR = 0.7;

export type MatchBand = 'auto' | 'review' | 'none';

export function classifyScore(score: number): MatchBand {
  if (score >= AUTO_LINK_SCORE) return 'auto';
  if (score >= REVIEW_SCORE) return 'review';
  return 'none';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Words that describe the listing rather than name the event. */
const FILLER_TOKENS = new Set([
  'edition', 'cfp', 'cft', 'call', 'for', 'papers', 'proposals', 'presentations', 'sessions', 'speakers',
  'the', 'person', 'online', 'virtual', 'hybrid', 'sessionize', 'pretalx', 'com',
]);

/**
 * Tokens that never identify an event on their own: generic words plus the
 * name-shaped filler of directory pages ("Law Conferences in California").
 * `distinctiveTokens` drops them before the auto-link gate compares names.
 */
const NON_DISTINCTIVE_TOKENS = new Set([
  'conferences', 'expo', 'exhibition', 'congress', 'meeting', 'seminar', 'symposia', 'workshops', 'conf',
  'academic', 'scientific', 'research', 'professional', 'regional', 'state', 'usa', 'us', 'uk', 'eu',
]);

/**
 * Tokens too common to find candidates by: they stay in the name (so
 * "Cloud Native Summit" and "Cloud Native Valencia" still differ) but an
 * overlap on them alone pulls in half the catalogue.
 */
const GENERIC_TOKENS = new Set([
  'conference', 'conf', 'con', 'summit', 'symposium', 'workshop', 'meetup', 'day', 'days', 'week', 'forum',
  'festival', 'fest', 'tech', 'technology', 'international', 'global', 'european', 'europe', 'national',
  'annual', 'and', 'on', 'in', 'of', 'at', 'with', 'de', 'la', 'le', 'el', 'du', 'des', 'der', 'die', 'das',
  'live', 'event', 'events', 'series', 'season', 'world', 'developer', 'developers', 'dev', 'devs',
]);

/** Platforms many unrelated events share; their domain says nothing about which event a page is for. */
const HOSTING_DOMAINS = new Set([
  'sessionize.com', 'pretalx.com', 'pretalx.de', 'meetup.com', 'eventbrite.com', 'eventbrite.co.uk', 'eventbrite.de',
  'luma.com', 'lu.ma', 'community.dev', 'advocu.com', 'conference-hall.io', 'wikicfp.com', 'linuxfoundation.org',
  'gitnation.com', 'cfp.dev', 'devopsdays.org', 'papercall.io', 'hopin.com', 'bevy.com', 'confs.tech',
  'callingallpapers.com', 'developers.events', 'conferencealerts.com', 'easychair.org', 'openreview.net',
  // Conference directories: one site, thousands of unrelated events.
  'allconferencealert.com', 'conferencealert.com', 'internationalconferencealerts.com', 'conferenceindex.org',
  'conferencenext.com', 'conference-service.com', 'conferencelists.org', 'academicconferences.org',
  'allconferences.com', 'clocate.com', '10times.com', 'waset.org', 'scholarsconferences.com', 'conferenceseries.com',
  'eventsget.com', 'papercrowd.com', 'conferencealerts.co.uk', 'wikicfp.org',
  'cvent.com', 'ti.to', 'tito.io', 'google.com', 'forms.gle', 'typeform.com', 'airtable.com', 'notion.site',
  'notion.so', 'linkedin.com', 'facebook.com', 'x.com', 'twitter.com', 'youtube.com', 'github.com', 'github.io',
  'ieee.org', 'acm.org', 'hubspot.com', 'hsforms.com', 'jotform.com', 'swoogo.com', 'bizzabo.com', 'vfairs.com',
]);

const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ne', 'or', 'go', 'gob', 'mil']);

const YEAR_PATTERN = /(?<![0-9])(19|20)\d{2}(?![0-9])/g;
const APOSTROPHE_YEAR_PATTERN = /'\d{2}(?![0-9])/g;
/** A two-digit year glued to a word: ScanAgile27, dnc26. */
const GLUED_SHORT_YEAR_PATTERN = /(?<=[a-z]{3,})2\d(?![0-9a-z])/g;
const ORDINAL_PATTERN = /(?<![0-9])\d{1,3}(st|nd|rd|th)(?![a-z])/g;
const TRAILING_EDITION_NUMBER = /\s\d{1,2}$/;

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`]/g, "'")
    .toLowerCase();
}

function stripEditionMarkers(text: string): string {
  return text
    .replace(APOSTROPHE_YEAR_PATTERN, ' ')
    .replace(YEAR_PATTERN, ' ')
    .replace(GLUED_SHORT_YEAR_PATTERN, '')
    .replace(ORDINAL_PATTERN, ' ');
}

/**
 * The name of an event as a lowercase token string: diacritics folded, years
 * ("2026", "'26", "ScanAgile27"), ordinals ("12th"), a trailing edition number
 * ("SecretCon 5") and listing words ("CFP", "Edition") removed, punctuation
 * turned into spaces. Words like "conference" or "summit" are kept.
 */
export function normalizeEventName(title: string): string {
  const tokens = stripEditionMarkers(fold(title))
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !FILLER_TOKENS.has(token));
  return tokens.join(' ').replace(TRAILING_EDITION_NUMBER, '');
}

/** Unique normalized tokens of a name, in order of first appearance. */
export function nameTokens(title: string): string[] {
  const normalized = normalizeEventName(title);
  return normalized ? [...new Set(normalized.split(' '))] : [];
}

/** The tokens worth looking candidates up by: name tokens without the generic ones. */
export function lookupTokens(title: string): string[] {
  return nameTokens(title).filter((token) => !GENERIC_TOKENS.has(token) && token.length > 1);
}

/** The tokens that actually tell one event from another: no generic, directory or listing words. */
export function distinctiveTokens(title: string): string[] {
  return lookupTokens(title).filter((token) => !NON_DISTINCTIVE_TOKENS.has(token));
}

const ACRONYM_PATTERN = /\(([A-Z][A-Za-z0-9&-]{1,14}?)\s*(?:'?\d{2,4})?\)/g;

/**
 * Acronyms written in parentheses, uppercased and without a trailing year:
 * "(PREE 2026)" → "PREE", "(EPPC27)" → "EPPC", "(WEI-TSE-Miami 2027)" → "WEI-TSE-MIAMI".
 * The strongest identity signal an academic title carries.
 */
export function parenthesisedAcronyms(title: string): string[] {
  const found = new Set<string>();
  for (const match of title.matchAll(ACRONYM_PATTERN)) {
    const raw = match[1].replace(/\d+$/, '');
    // Mostly capitals: "(In-Person)" is a note, "(WEI-TSE-Miami)" an acronym.
    const letters = raw.replace(/[^A-Za-z0-9]/g, '');
    const capitals = letters.replace(/[^A-Z0-9]/g, '').length;
    if (letters.length >= 2 && capitals * 2 >= letters.length) found.add(raw.toUpperCase());
  }
  return [...found];
}

/** `normalizeEventName` joined with hyphens, for `Event.slug`. */
export function slugify(title: string): string {
  return normalizeEventName(title).replace(/\s+/g, '-');
}

/** The title with its year and edition markers removed but its casing kept; the title itself if nothing is left. */
export function displayName(title: string): string {
  const stripped = stripEditionMarkers(title.replace(/[‘’ʼ`]/g, "'"))
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:,.|]+|[\s\-–—:,.|]+$/g, '')
    .replace(TRAILING_EDITION_NUMBER, '')
    .trim();
  return stripped.length > 0 ? stripped : title.trim();
}

/** The year this row is an edition for: the event date's year, else a year in the title. */
export function deriveEditionYear(row: { title: string; eventDate: Date | null }): number | null {
  if (row.eventDate && !Number.isNaN(row.eventDate.getTime())) return row.eventDate.getUTCFullYear();
  const full = row.title.match(/(?<![0-9])(19|20)\d{2}(?![0-9])/);
  if (full) return Number(full[0]);
  const short = fold(row.title).match(/'(\d{2})(?![0-9])|(?<=[a-z]{3,})(2\d)(?![0-9a-z])/);
  if (short) return 2000 + Number(short[1] ?? short[2]);
  return null;
}

/** `example.co.uk` for `https://cfp.example.co.uk/x`; null when the URL cannot be parsed. */
export function registrableDomain(url: string): string | null {
  if (!url || !url.trim()) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.includes('.')) return null;
  const labels = host.replace(/^www\./, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  if (tld.length === 2 && SECOND_LEVEL_LABELS.has(second)) return labels.slice(-3).join('.');
  return labels.slice(-2).join('.');
}

export function isHostingDomain(domain: string | null): boolean {
  return domain !== null && HOSTING_DOMAINS.has(domain);
}

/** The domain of the event's own site, or null when the URL is on a shared platform. */
export function eventDomain(url: string): string | null {
  const domain = registrableDomain(url);
  return domain && !isHostingDomain(domain) ? domain : null;
}

function bigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) grams.add(text.slice(i, i + 2));
  return grams;
}

function intersectionSize<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const item of a) if (b.has(item)) n++;
  return n;
}

/**
 * 0..1 similarity of two event names: token Jaccard, character-bigram Dice and
 * token containment (so "BSides Prague" sits close to "BSides Prague Czechia"),
 * weighted 0.4 / 0.4 / 0.2. Zero when either normalizes to nothing.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeEventName(a);
  const nb = normalizeEventName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  const shared = intersectionSize(ta, tb);
  const jaccard = shared / (ta.size + tb.size - shared);
  const containment = shared / Math.min(ta.size, tb.size);
  const ga = bigrams(na);
  const gb = bigrams(nb);
  const dice = ga.size + gb.size > 0 ? (2 * intersectionSize(ga, gb)) / (ga.size + gb.size) : 0;
  return 0.4 * jaccard + 0.4 * dice + 0.2 * containment;
}

const LOCATION_FILLER = new Set(['the', 'of', 'and', 'online', 'remote', 'virtual', 'hybrid', 'tbd', 'tba']);

/** Tokens a location may carry for a name token that spells the place differently. */
const PLACE_SYNONYMS: Record<string, string[]> = {
  usa: ['united', 'states', 'us', 'america'],
  us: ['united', 'states', 'usa'],
  uk: ['united', 'kingdom', 'britain', 'england'],
  czechia: ['czech'],
  holland: ['netherlands'],
};

/** Every token of a location, for checking whether a name token names the place. */
function locationTokens(location: string | null): Set<string> {
  if (!location) return new Set();
  return new Set(fold(location).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length >= 2));
}

function placeExplains(token: string, locations: Set<string>): boolean {
  if (locations.has(token)) return true;
  return (PLACE_SYNONYMS[token] ?? []).some((alias) => locations.has(alias));
}

/** Words a location shares with every other location in the same country; never evidence of the same place. */
const COUNTRY_TOKENS = new Set(['united', 'states', 'usa', 'us', 'america', 'kingdom', 'uk', 'republic', 'federation']);

/**
 * Whether both rows say where they are and share no place word at all. The
 * whole location counts, not just its first part: Sessionize puts the venue
 * first ("Moscone Convention Center, San Francisco, California").
 */
function citiesDisagree(a: string | null, b: string | null): boolean {
  const ta = new Set([...locationTokens(a)].filter((t) => t.length >= 3 && !LOCATION_FILLER.has(t) && !COUNTRY_TOKENS.has(t)));
  const tb = new Set([...locationTokens(b)].filter((t) => t.length >= 3 && !LOCATION_FILLER.has(t) && !COUNTRY_TOKENS.has(t)));
  return ta.size > 0 && tb.size > 0 && intersectionSize(ta, tb) === 0;
}

/**
 * Why a pair may not auto-link however high its score, or null when it may:
 * the names must agree on what is distinctive. The shorter name's distinctive
 * tokens must all appear in the longer one; every extra token of the longer
 * name must be explained (an acronym it carries, or the place either row is
 * in); parenthesised acronyms must not contradict; the cities must not
 * differ. The score still lands in the review band, so the admin list shows it.
 */
export function autoLinkObjection(a: MatchCandidate, b: MatchCandidate): string | null {
  const acronymsA = parenthesisedAcronyms(a.title);
  const acronymsB = parenthesisedAcronyms(b.title);
  if (acronymsA.length && acronymsB.length && !acronymsA.some((x) => acronymsB.includes(x))) return 'acronyms differ';
  if (citiesDisagree(a.location, b.location)) return 'cities differ';

  const ta = distinctiveTokens(a.title);
  const tb = distinctiveTokens(b.title);
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shorter.length === 0) return 'nothing distinctive';
  const longerSet = new Set(longer);
  if (!shorter.every((token) => longerSet.has(token))) return 'distinctive words differ';

  const shorterSet = new Set(shorter);
  const acronyms = new Set([...acronymsA, ...acronymsB].map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const places = new Set([...locationTokens(a.location), ...locationTokens(b.location)]);
  const unexplained = longer.filter((token) => !shorterSet.has(token) && !acronyms.has(token) && !placeExplains(token, places));
  return unexplained.length > 0 ? `extra words: ${unexplained.join(', ')}` : null;
}

/** The city part of a location: what comes before the first comma or bracket. */
function cityTokens(location: string): Set<string> {
  const city = fold(location).split(/[,([|/]/)[0];
  return new Set(
    city
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((token) => token.length >= 3 && !LOCATION_FILLER.has(token))
  );
}

function locationSignal(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const ca = cityTokens(a);
  const cb = cityTokens(b);
  if (ca.size === 0 || cb.size === 0) return 0;
  return intersectionSize(ca, cb) > 0 ? 0.05 : -0.05;
}

function dateSignal(a: Date | null, b: Date | null): number {
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const days = Math.abs(a.getTime() - b.getTime()) / DAY_MS;
  if (days <= 45) return 0.1;
  const years = Math.round(days / 365.25);
  if (years >= 1 && years <= 3 && Math.abs(days - years * 365.25) <= 60) return 0.07;
  return -0.05;
}

function domainSignal(a: string, b: string): number {
  const da = eventDomain(a);
  const db = eventDomain(b);
  if (!da || !db) return 0;
  return da === db ? 0.15 : -0.1;
}

/**
 * How likely two rows are editions of one event, 0..1, symmetric. The name
 * carries most of the weight (0.75); a shared event domain (+0.15, −0.1 when
 * both have different sites of their own), the organizer (+0.05), the event
 * dates (+0.1 within 45 days, +0.07 about a whole number of years apart,
 * −0.05 otherwise) and the city (±0.05) adjust it. A name below
 * `AUTO_NAME_FLOOR`, or a pair `autoLinkObjection` rejects, is capped just
 * under the auto-link threshold.
 */
export function scoreCandidate(a: MatchCandidate, b: MatchCandidate): number {
  const name = nameSimilarity(a.title, b.title);
  if (name === 0) return 0;
  let score = 0.75 * name;
  score += domainSignal(a.applyUrl, b.applyUrl);
  if (nameSimilarity(a.organization ?? '', b.organization ?? '') >= 0.8) score += 0.05;
  score += dateSignal(a.eventDate, b.eventDate);
  score += locationSignal(a.location, b.location);
  if (name < AUTO_NAME_FLOOR || autoLinkObjection(a, b) !== null) score = Math.min(score, AUTO_LINK_SCORE - 0.01);
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
}
