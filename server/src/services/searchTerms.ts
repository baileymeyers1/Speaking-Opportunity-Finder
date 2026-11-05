/**
 * How a search box query matches a row, shared by the stored search and the
 * live-search relevance check. A query is split into words; stopwords are
 * dropped; every remaining word must appear somewhere in the row.
 *
 * Words of three characters or fewer ("ai", "pr", "ux") must match a whole
 * word, so "ai" does not match "said" or "retail". Longer words only need to
 * start a word, so "conference" matches "conferences" and "speak" matches
 * "speakers".
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it',
  'of', 'on', 'or', 'the', 'to', 'with', 'about', 'how', 'what', 'who', 'my', 'our', 'your',
]);

/** Characters that count as part of a word when checking word boundaries. */
const WORD_CHAR = 'a-z0-9';

export function searchTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    // Strip punctuation at the edges but keep symbols inside or leading a term (c++, .net, node.js).
    .map((word) => word.replace(/^[^a-z0-9.#+]+|[^a-z0-9#+]+$/g, ''))
    .filter((word) => word.length > 0 && /[a-z0-9]/.test(word) && !STOPWORDS.has(word));
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
    pattern = new RegExp(`(?<![${WORD_CHAR}])${escapeRegExp(term)}${end}`, 'i');
    patternCache.set(term, pattern);
  }
  return pattern;
}

export function termMatches(term: string, text: string | null | undefined): boolean {
  if (!text) return false;
  return termPattern(term).test(text);
}

/** True when every term appears in at least one of the fields. */
export function matchesAllTerms(terms: readonly string[], fields: ReadonlyArray<string | null | undefined>): boolean {
  return terms.every((term) => fields.some((field) => termMatches(term, field)));
}
