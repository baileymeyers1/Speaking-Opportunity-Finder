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
 * "public relations" answers a search for "PR" (see SYNONYMS).
 */

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

/** The forms a term matches: itself, then its synonyms. */
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

/** True when every term, or one of its synonyms, appears in at least one of the fields. */
export function matchesAllTerms(terms: readonly string[], fields: ReadonlyArray<string | null | undefined>): boolean {
  return terms.every((term) =>
    termAlternatives(term).some((form) => fields.some((field) => termMatches(form, field)))
  );
}
