/**
 * Cheap triage of search hits, live and scheduled, before any page is read.
 * Broad queries bring back many articles about the topic; these rules drop
 * the ones whose title says they are an article and the ones on hosts that
 * are never an event's own page, and rank the rest so a live search's few
 * Claude reads go to pages that look like a call for speakers.
 */

export interface TriageInput {
  title: string;
  description: string | null;
  applyUrl: string;
}

/** Titles that only articles have: how-tos, listicles, explainers, blogs. */
const ARTICLE_TITLE_PATTERNS: readonly RegExp[] = [
  /^how (to|pr|ai|teams?|brands?|companies|agencies)\b/i,
  /\bhow to\b/i,
  /^(the )?(top|best) \d*\s*/i,
  /\b\d+ (ways|tips|tools|trends|things|reasons|examples|podcasts|books|steps)\b/i,
  /\bbest (ai )?(tools|practices|podcasts|apps|software)\b/i,
  /\bwhat (you|communicators|marketers|leaders) need to know\b/i,
  /\b(definition|benefits) (&|and) examples\b/i,
  /\b(a|the) (beginner'?s )?guide to\b/i,
  /\bblog\b/i,
  /\bpodcasts? to (follow|pitch|listen)\b/i,
];

/**
 * Hosts that are never an event's own page: forums and blogs, and social
 * networks, where a hit is a profile or a post about an event (and sits
 * behind a login, so it could not be read anyway).
 */
const NON_EVENT_HOSTS: readonly string[] = [
  'reddit.com',
  'quora.com',
  'medium.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'tiktok.com',
];

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function looksLikeArticle(hit: TriageInput): boolean {
  const host = hostname(hit.applyUrl);
  if (NON_EVENT_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return true;
  return ARTICLE_TITLE_PATTERNS.some((pattern) => pattern.test(hit.title));
}

/** Wording that says the page is asking for speakers. */
const CALL_PATTERNS: readonly RegExp[] = [
  /\bcall for (speakers|proposals|papers|presenters|presentations|abstracts|sessions|submissions)\b/i,
  /\bcfp\b/i,
  /\bsubmit (a|your) (session|talk|proposal|abstract|presentation)\b/i,
  /\bspeakers? (wanted|application|applications|submission|submissions)\b/i,
  /\b(apply|applications?) to speak\b/i,
  /\bbecome a speaker\b/i,
  /\bspeaking opportunit(y|ies)\b/i,
  /\bpodcast guests?\b/i,
];

/** An event page: an event word and a year or a month-day date in the title. */
const EVENT_WORD = /\b(conference|summit|symposium|forum|congress|expo|festival|webinar|workshop|meetup|live)\b/i;
const DATE_IN_TITLE = /\b(20\d\d)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i;

/**
 * How much a hit looks like an open call: 2 for explicit call wording, 1 for
 * an event page with a date, 0 otherwise. Used to order the in-request reads.
 */
export function callSignal(hit: TriageInput): number {
  const text = `${hit.title} ${hit.description ?? ''}`;
  if (CALL_PATTERNS.some((pattern) => pattern.test(text))) return 2;
  if (EVENT_WORD.test(hit.title) && DATE_IN_TITLE.test(hit.title)) return 1;
  return 0;
}
