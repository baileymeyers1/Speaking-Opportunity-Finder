import { describe, it, expect } from 'vitest';
import {
  cleanTitle,
  extractOrganization,
  parseDate,
  detectPlaceholderDescription,
  normalizeIndustries,
} from './dataNormalization';

describe('cleanTitle', () => {
  it('strips " - Call for Speakers" suffix', () => {
    expect(cleanTitle('ReactConf 2026 - Call for Speakers')).toBe(
      'ReactConf 2026',
    );
  });

  it('strips " - Call for Papers" suffix', () => {
    expect(cleanTitle('DevSummit - Call for Papers')).toBe('DevSummit');
  });

  it('strips " - Call for Proposals" suffix', () => {
    expect(cleanTitle('JSConf - Call for Proposals')).toBe('JSConf');
  });

  it('strips " - CFP" suffix', () => {
    expect(cleanTitle('NodeConf - CFP')).toBe('NodeConf');
  });

  it('strips " | Call for Speakers" suffix', () => {
    expect(cleanTitle('PyCon | Call for Speakers')).toBe('PyCon');
  });

  it('strips " | Call for Papers" suffix', () => {
    expect(cleanTitle('RubyKaigi | Call for Papers')).toBe('RubyKaigi');
  });

  it('is case insensitive', () => {
    expect(cleanTitle('GoConf - call for speakers')).toBe('GoConf');
    expect(cleanTitle('GoConf - CALL FOR PAPERS')).toBe('GoConf');
  });

  it('does not strip when "Call for" appears at the start', () => {
    expect(cleanTitle('Call for Speakers at DevFest')).toBe(
      'Call for Speakers at DevFest',
    );
  });

  it('trims whitespace', () => {
    expect(cleanTitle('  ReactConf 2026  ')).toBe('ReactConf 2026');
  });

  it('leaves clean titles unchanged', () => {
    expect(cleanTitle('KubeCon Europe 2026')).toBe('KubeCon Europe 2026');
  });
});

describe('extractOrganization', () => {
  it('splits on " | " and takes first meaningful part', () => {
    expect(extractOrganization('ReactConf | Call for Speakers')).toBe(
      'ReactConf',
    );
  });

  it('splits on " - " and takes first meaningful part', () => {
    expect(extractOrganization('DevSummit - Call for Papers')).toBe(
      'DevSummit',
    );
  });

  it('splits on " by "', () => {
    expect(extractOrganization('Annual Meetup by Google')).toBe(
      'Annual Meetup',
    );
  });

  it('splits on " @ "', () => {
    expect(extractOrganization('Tech Talk @ Microsoft')).toBe('Tech Talk');
  });

  it('splits on " at "', () => {
    expect(extractOrganization('Workshop at Amazon')).toBe('Workshop');
  });

  it('filters out noise parts', () => {
    expect(extractOrganization('CFP | DevConf 2026')).toBe('DevConf 2026');
  });

  it('strips trailing year when stripYear=true', () => {
    expect(extractOrganization('ReactConf 2026', true)).toBe('ReactConf');
  });

  it('does not strip year when stripYear is not set', () => {
    expect(extractOrganization('ReactConf 2026')).toBe('ReactConf 2026');
  });

  it('returns "Unknown Organization" for null input', () => {
    expect(extractOrganization(null)).toBe('Unknown Organization');
  });

  it('returns "Unknown Organization" for undefined input', () => {
    expect(extractOrganization(undefined)).toBe('Unknown Organization');
  });

  it('returns "Unknown Organization" for empty string', () => {
    expect(extractOrganization('')).toBe('Unknown Organization');
  });
});

describe('parseDate', () => {
  it('parses ISO format: 2026-03-15', () => {
    const d = parseDate('2026-03-15');
    expect(d).toEqual(new Date(2026, 2, 15));
  });

  it('parses MM/DD/YYYY: 03/15/2026', () => {
    const d = parseDate('03/15/2026');
    expect(d).toEqual(new Date(2026, 2, 15));
  });

  it('parses "Month DD, YYYY": January 15, 2026', () => {
    const d = parseDate('January 15, 2026');
    expect(d).toEqual(new Date(2026, 0, 15));
  });

  it('parses abbreviated month: Jan 15, 2026', () => {
    const d = parseDate('Jan 15, 2026');
    expect(d).toEqual(new Date(2026, 0, 15));
  });

  it('parses "DD Month YYYY": 15 March 2026', () => {
    const d = parseDate('15 March 2026');
    expect(d).toEqual(new Date(2026, 2, 15));
  });

  it('returns null for null input', () => {
    expect(parseDate(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('yesterday')).toBeNull();
    expect(parseDate('asdf1234')).toBeNull();
  });

  it('handles whitespace around input', () => {
    const d = parseDate('  2026-03-15  ');
    expect(d).toEqual(new Date(2026, 2, 15));
  });
});

describe('detectPlaceholderDescription', () => {
  it('returns true for null', () => {
    expect(detectPlaceholderDescription(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(detectPlaceholderDescription(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(detectPlaceholderDescription('')).toBe(true);
  });

  it('returns true for short descriptions (< 60 chars)', () => {
    expect(detectPlaceholderDescription('A short description.')).toBe(true);
  });

  it('returns true for "Submit your talk" pattern', () => {
    expect(
      detectPlaceholderDescription(
        'Submit your talk to this conference and share your knowledge with the developer community worldwide.',
      ),
    ).toBe(true);
  });

  it('returns true for "Call for speakers now open" pattern', () => {
    expect(
      detectPlaceholderDescription(
        'Call for speakers now open for all topics related to modern software development and architecture.',
      ),
    ).toBe(true);
  });

  it('returns true for "Call for papers now open" pattern', () => {
    expect(
      detectPlaceholderDescription(
        'Call for papers now open. We are looking for talks on all topics related to cloud computing.',
      ),
    ).toBe(true);
  });

  it('returns true for "We are" pattern', () => {
    expect(
      detectPlaceholderDescription(
        'We are looking for speakers to present at our upcoming conference on frontend development.',
      ),
    ).toBe(true);
  });

  it('returns true for "We invite you to" pattern', () => {
    expect(
      detectPlaceholderDescription(
        'We invite you to submit your talk proposals for our annual developer conference this year.',
      ),
    ).toBe(true);
  });

  it('returns false for real descriptions (60+ chars, no placeholder pattern)', () => {
    expect(
      detectPlaceholderDescription(
        'This three-day conference focuses on modern JavaScript frameworks, performance optimization, and developer tooling best practices.',
      ),
    ).toBe(false);
  });
});

describe('normalizeIndustries', () => {
  it('lowercases all entries', () => {
    expect(normalizeIndustries(['Technology', 'FINANCE'])).toEqual([
      'technology',
      'finance',
    ]);
  });

  it('deduplicates case-insensitively', () => {
    expect(
      normalizeIndustries(['Technology', 'technology', 'TECHNOLOGY']),
    ).toEqual(['technology']);
  });

  it('filters out generic tags', () => {
    expect(
      normalizeIndustries([
        'technology',
        'events',
        'general',
        'other',
        'misc',
        'cross-industry',
      ]),
    ).toEqual(['technology']);
  });

  it('caps at 5 entries', () => {
    expect(
      normalizeIndustries([
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
      ]),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns empty array for null input', () => {
    expect(normalizeIndustries(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(normalizeIndustries(undefined)).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(normalizeIndustries([])).toEqual([]);
  });

  it('filters out empty strings', () => {
    expect(normalizeIndustries(['', 'technology', '  '])).toEqual([
      'technology',
    ]);
  });
});
