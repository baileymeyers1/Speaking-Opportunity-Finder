import { MAX_SECTORS, type Sector } from '../lib/sectors.js';
import { BROAD_PHRASES, type BroadPhrase } from './sectorBroadWords.js';
import { SECTOR_PHRASES } from './sectorPhrases.js';

/**
 * Free-text tags to sectors, with no model call. Scraped rows, rows stored
 * before sectors existed and old `industries` filter values are placed by the
 * words of their tags; a row Claude has read carries Claude's sectors instead
 * (extraction.ts).
 */

/** Longest phrase, in words, that the lookup tries. */
const MAX_PHRASE_WORDS = 4;

/** Plurals that are a different word from their singular: "securities" is finance, "security" is not. */
const KEEP_PLURAL = new Set(['securities']);

function singular(word: string): string {
  if (word.length <= 3 || KEEP_PLURAL.has(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ss') || word.endsWith('us') || word.endsWith('is')) return word;
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/** Lowercase words of a tag or phrase: accents, punctuation and plurals removed. */
export function tagWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9#+]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular);
}

function buildIndex(): { strong: Map<string, Sector[]>; broad: Map<string, BroadPhrase> } {
  const strong = new Map<string, Sector[]>();
  for (const [sector, phrases] of Object.entries(SECTOR_PHRASES) as Array<[Sector, readonly string[]]>) {
    for (const phrase of phrases) {
      const key = tagWords(phrase).join(' ');
      const sectors = strong.get(key) ?? [];
      if (!sectors.includes(sector)) sectors.push(sector);
      strong.set(key, sectors);
    }
  }
  const broad = new Map<string, BroadPhrase>();
  for (const [phrase, entry] of Object.entries(BROAD_PHRASES)) broad.set(tagWords(phrase).join(' '), entry);
  return { strong, broad };
}

const INDEX = buildIndex();

interface TagMatch {
  /** Sectors the tag's phrases name outright. */
  strong: Sector[];
  /** The broad words found in the tag. */
  broad: BroadPhrase[];
}

/** Match a tag on its longest known phrases; words a longer phrase covered are not reused. */
function matchTag(tag: string): TagMatch {
  const words = tagWords(tag);
  const covered = new Array<boolean>(words.length).fill(false);
  const match: TagMatch = { strong: [], broad: [] };
  for (let size = Math.min(MAX_PHRASE_WORDS, words.length); size >= 1; size--) {
    for (let start = 0; start + size <= words.length; start++) {
      if (covered.slice(start, start + size).some(Boolean)) continue;
      const key = words.slice(start, start + size).join(' ');
      const strong = INDEX.strong.get(key);
      const broad = strong ? undefined : INDEX.broad.get(key);
      if (!strong && !broad) continue;
      covered.fill(true, start, start + size);
      if (strong) for (const sector of strong) if (!match.strong.includes(sector)) match.strong.push(sector);
      if (broad) match.broad.push(broad);
    }
  }
  return match;
}

/**
 * The one or two sectors a row's tags point to, strongest first; empty when
 * no tag says anything. Each tag counts once per sector, the sector named by
 * most tags wins and the earlier tag breaks a tie. Broad words
 * (sectorBroadWords.ts) only add to a sector another tag already named.
 */
export function sectorsFromTags(tags: readonly string[] | null | undefined): Sector[] {
  if (!tags || tags.length === 0) return [];
  const votes = new Map<Sector, number>();
  const broad: BroadPhrase[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const match = matchTag(tag);
    for (const sector of match.strong) votes.set(sector, (votes.get(sector) ?? 0) + 1);
    broad.push(...match.broad);
  }
  if (votes.size === 0) {
    // Nothing but broad words: the first one that can stand alone places the row.
    const alone = broad.find((entry) => entry.alone)?.alone;
    return alone ? [alone] : [];
  }
  for (const entry of broad) {
    const supported = entry.supports.find((sector) => votes.has(sector));
    if (supported) votes.set(supported, (votes.get(supported) ?? 0) + 1);
  }
  // A Map keeps insertion order and the sort is stable, so equal counts stay in tag order.
  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SECTORS)
    .map(([sector]) => sector);
}

/** Whether a tag contains any word or phrase the mapping knows. The backfill reports the ones that do not. */
export function isKnownTag(tag: string): boolean {
  const match = matchTag(tag);
  return match.strong.length > 0 || match.broad.length > 0;
}

/** Sectors from a JSON-encoded `industries` column value. */
export function sectorsFromIndustriesJson(value: string | null | undefined): Sector[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? sectorsFromTags(parsed.filter((tag): tag is string => typeof tag === 'string')) : [];
  } catch {
    return [];
  }
}
