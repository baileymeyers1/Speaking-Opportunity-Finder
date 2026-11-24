/**
 * How a search box query matches a row, shared by the stored search and the
 * live-search relevance check. A query is split into words; stopwords are
 * dropped; every remaining word must appear somewhere in the row.
 *
 * Words of three characters or fewer ("ai", "pr", "ux") must match a whole
 * word, so "ai" does not match "said" or "retail". Longer words only need to
 * start a word, so "conference" matches "conferences" and "speak" matches
 * "speakers".
 *
 * A few short abbreviations also match their spelled-out forms: a page about
 * "public relations" answers a search for "PR" (see SYNONYMS). A word that
 * names a sector ("energy") also matches the sector's longer phrases and the
 * rows in that sector (see SECTOR_BY_WORD).
 */

import { SECTORS, type Sector } from '../lib/sectors.js';
import { SECTOR_PHRASES } from './sectorPhrases.js';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it',
  'of', 'on', 'or', 'the', 'to', 'with', 'about', 'how', 'what', 'who', 'my', 'our', 'your',
]);

/**
 * Spelled-out forms an abbreviation also matches. Kept narrow on purpose:
 * "communications" alone would pull in telecoms, so PR lists the phrases PR
 * people use rather than the bare word.
 */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  pr: ['public relations', 'comms', 'corporate communications', 'strategic communications', 'marketing communications'],
  comms: ['communications', 'public relations', 'pr'],
  ai: ['artificial intelligence', 'genai', 'generative ai'],
  ml: ['machine learning'],
  ux: ['user experience'],
  hr: ['human resources'],
  dei: ['diversity equity and inclusion', 'diversity and inclusion'],
};

/**
 * Words that name a sector on their own ("energy", "healthcare", "logistics"):
 * its id or its one-word search term (lib/sectors.ts).
 */
const SECTOR_BY_WORD: ReadonlyMap<string, Sector> = new Map(
  SECTORS.flatMap((sector) =>
    [sector.id, sector.searchTerm].filter((word) => /^[a-z]+$/.test(word)).map((word) => [word, sector.id] as const)
  )
);

/** The sector a search word names, or null. */
export function sectorOfTerm(term: string): Sector | null {
  return SECTOR_BY_WORD.get(term) ?? null;
}

/**
 * A sector word also matches the sector's phrases of two words or more
 * ("oil and gas", "offshore wind" for energy), but only in a row's headline:
 * its title, organization and tags. Measured on production's 835 listings
 * (2026-11-24), a phrase in a description is mostly a passing mention (a
 * DevOps conference on "risk management", a .NET day on "social media").
 * Single words are left out: "power", "battery" or "utility" name too many
 * things outside the sector.
 */
const SECTOR_PHRASES_BY_WORD: ReadonlyMap<string, readonly string[]> = new Map(
  [...SECTOR_BY_WORD].map(([word, sector]) => [word, SECTOR_PHRASES[sector].filter((phrase) => phrase.includes(' '))])
);

/** The phrases a sector word also matches in a row's headline; none for other words. */
export function sectorPhrases(term: string): readonly string[] {
  return SECTOR_PHRASES_BY_WORD.get(term) ?? [];
}

/** The forms a term matches anywhere: itself, then its synonyms. */
export function termAlternatives(term: string): readonly string[] {
  return [term, ...(SYNONYMS[term] ?? [])];
}

/**
 * The query spelled out for a web search: abbreviations that are ambiguous
 * to a search engine ("PR", "HR") get their first spelled-out form added.
 */
export function expandQuery(query: string): string {
  const expansions = searchTerms(query)
    .filter((term) => term !== 'ai' && SYNONYMS[term])
    .map((term) => SYNONYMS[term][0]);
  return expansions.length > 0 ? `${query} ${expansions.join(' ')}` : query;
}

/** Characters that count as part of a word when checking word boundaries: any letter or digit, accented ones included. */
const WORD_CHAR = '\\p{L}\\p{N}';

export function searchTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    // Strip punctuation at the edges but keep symbols inside or leading a term (c++, .net, node.js).
    .map((word) => word.replace(/^[^\p{L}\p{N}.#+]+|[^\p{L}\p{N}#+]+$/gu, ''))
    .filter((word) => word.length > 0 && /[\p{L}\p{N}]/u.test(word) && !STOPWORDS.has(word));
  return [...new Set(terms)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const patternCache = new Map<string, RegExp>();

function termPattern(term: string): RegExp {
  let pattern = patternCache.get(term);
  if (!pattern) {
    const end = term.length <= 3 ? `(?![${WORD_CHAR}])` : '';
    pattern = new RegExp(`(?<![${WORD_CHAR}])${escapeRegExp(term)}${end}`, 'iu');
    patternCache.set(term, pattern);
  }
  return pattern;
}

export function termMatches(term: string, text: string | null | undefined): boolean {
  if (!text) return false;
  return termPattern(term).test(text);
}

export interface SectorContext {
  /**
   * The row's sectors. Pass them only for a stored row (sectors from Claude or
   * from its tags), never for a live hit's regex guess, which carries the
   * sector that was searched for.
   */
  sectors?: readonly string[];
  /** The row's title, organization and tags, where a sector word's phrases count. */
  headline?: ReadonlyArray<string | null | undefined>;
}

/**
 * True when every term holds for the row: the term or a synonym appears in
 * one of the fields, or the term names a sector the row is in, or one of that
 * sector's phrases appears in the row's headline.
 */
export function matchesAllTerms(
  terms: readonly string[],
  fields: ReadonlyArray<string | null | undefined>,
  { sectors = [], headline = [] }: SectorContext = {}
): boolean {
  return terms.every((term) => {
    const sector = sectorOfTerm(term);
    if (sector && sectors.includes(sector)) return true;
    if (termAlternatives(term).some((form) => fields.some((field) => termMatches(form, field)))) return true;
    return sectorPhrases(term).some((phrase) => headline.some((field) => termMatches(phrase, field)));
  });
}
