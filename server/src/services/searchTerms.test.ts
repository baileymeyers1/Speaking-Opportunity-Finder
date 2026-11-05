import { describe, it, expect } from 'vitest';
import { expandQuery, matchesAllTerms, searchTerms, termMatches } from './searchTerms.js';

describe('searchTerms', () => {
  it('keeps short meaningful words and drops stopwords', () => {
    expect(searchTerms('AI for PR')).toEqual(['ai', 'pr']);
  });

  it('lowercases, strips punctuation at the edges and dedupes', () => {
    expect(searchTerms('"Developer Experience", developer!')).toEqual(['developer', 'experience']);
  });

  it('keeps symbols inside a term', () => {
    expect(searchTerms('C++ and .NET')).toEqual(['c++', '.net']);
  });

  it('keeps accented letters', () => {
    expect(searchTerms('Café Tech, Zürich')).toEqual(['café', 'tech', 'zürich']);
  });

  it('returns nothing for a query made only of stopwords', () => {
    expect(searchTerms('for the and')).toEqual([]);
  });
});

describe('termMatches', () => {
  it('matches a short term only as a whole word', () => {
    expect(termMatches('ai', 'AI-powered PR tools')).toBe(true);
    expect(termMatches('ai', 'He said the retail summit')).toBe(false);
    expect(termMatches('pr', 'April product launch')).toBe(false);
    expect(termMatches('pr', 'The PR Week awards')).toBe(true);
  });

  it('treats accented letters as part of the word', () => {
    expect(termMatches('pr', 'buenas prácticas')).toBe(false);
    expect(termMatches('ai', 'Développeurs à Paris')).toBe(false);
    expect(termMatches('ia', 'agentes de IA')).toBe(true);
    expect(termMatches('café', 'Le Café Tech')).toBe(true);
  });

  it('lets a longer term match the start of a word (plurals, -er)', () => {
    expect(termMatches('conference', 'Conferences in 2027')).toBe(true);
    expect(termMatches('speak', 'Call for speakers')).toBe(true);
    expect(termMatches('relations', 'correlations')).toBe(false);
  });

  it('matches terms with symbols', () => {
    expect(termMatches('c++', 'A C++ meetup')).toBe(true);
    expect(termMatches('.net', 'The .NET conf')).toBe(true);
  });

  it('is false for empty text', () => {
    expect(termMatches('ai', null)).toBe(false);
  });
});

describe('matchesAllTerms', () => {
  it('requires every term somewhere across the fields', () => {
    expect(matchesAllTerms(['ai', 'pr'], ['AI for PR Conference', null])).toBe(true);
    expect(matchesAllTerms(['ai', 'pr'], ['AI Summit', 'Talks on PR strategy'])).toBe(true);
    expect(matchesAllTerms(['ai', 'pr'], ['Conf42 MLOps', 'AI and agentic systems'])).toBe(false);
  });

  it('matches everything when there are no terms', () => {
    expect(matchesAllTerms([], ['anything'])).toBe(true);
  });
});

describe('synonyms', () => {
  it('lets PR match pages that spell it out', () => {
    expect(matchesAllTerms(['ai', 'pr'], ['AI in Public Relations Summit', null])).toBe(true);
    expect(matchesAllTerms(['ai', 'pr'], ['Generative AI for corporate communications teams', null])).toBe(true);
  });

  it('does not treat bare "communications" as PR', () => {
    expect(matchesAllTerms(['ai', 'pr'], ['AI in satellite communications', null])).toBe(false);
  });

  it('lets AI match "artificial intelligence"', () => {
    expect(matchesAllTerms(['ai'], ['Artificial Intelligence in Healthcare'])).toBe(true);
  });
});

describe('expandQuery', () => {
  it('spells out ambiguous abbreviations for the web search', () => {
    expect(expandQuery('AI for PR')).toBe('AI for PR public relations');
    expect(expandQuery('HR tech')).toBe('HR tech human resources');
  });

  it('leaves a query without abbreviations alone', () => {
    expect(expandQuery('developer experience')).toBe('developer experience');
  });
});
