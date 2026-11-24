import { CANADIAN_PROVINCES, US_CITIES_BY_STATE, US_STATES } from './places.js';

/**
 * How a place typed into the location filter matches a row's free-text
 * location. Extraction stores "City, ST" for the US and "City, Country"
 * elsewhere; older and scraped rows say "City, Country (USA)", a bare city or
 * a state's full name. A typed place becomes a list of patterns, and a row is
 * in the place when any pattern holds. `opportunityQuery.placeWhere` turns the
 * same patterns into SQL, so the list and live search agree on every row.
 *
 * A state code is matched only as a code after a comma, case-sensitively:
 * "CA" must not find "Canada" or "Chicago", and "NY" not "Germany".
 */

export type PatternKind = 'equals' | 'startsWith' | 'endsWith' | 'contains';

export interface LocationPattern {
  kind: PatternKind;
  value: string;
  caseSensitive: boolean;
}

export interface PlaceQuery {
  /** What was typed, trimmed. */
  input: string;
  /** The place spelled out for a web search ("California" for "CA"). */
  searchText: string;
  patterns: LocationPattern[];
}

const COUNTRY_US = new Set(['us', 'usa', 'u.s', 'u.s.a', 'united states', 'united states of america', 'america']);
const COUNTRY_UK = new Set(['uk', 'u.k', 'united kingdom', 'great britain', 'britain']);
const UK_NAMES = ['United Kingdom', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'Great Britain'];

/** Other names for a state. */
const STATE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  calif: ['CA'],
  socal: ['CA'],
  norcal: ['CA'],
  'southern california': ['CA'],
  'northern california': ['CA'],
  'd.c': ['DC'],
  'washington dc': ['DC'],
  'washington d.c': ['DC'],
  // Typed alone, "Washington" is the state or the capital: both are offered.
  washington: ['WA', 'DC'],
};

/** Places known by a nickname, matched by the names they stand for. */
const PLACE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  nyc: ['New York'],
  'new york city': ['New York'],
  sf: ['San Francisco'],
  'bay area': ['San Francisco', 'Oakland', 'San Jose', 'Palo Alto', 'Mountain View', 'Santa Clara', 'Sunnyvale', 'Berkeley'],
  'silicon valley': ['San Jose', 'Palo Alto', 'Mountain View', 'Santa Clara', 'Sunnyvale', 'Cupertino'],
  philly: ['Philadelphia'],
  vegas: ['Las Vegas'],
};

/** "LA" is Louisiana's code, but people typing it usually mean Los Angeles: it finds both. */
const CODE_ALSO_A_CITY: Readonly<Record<string, string>> = { LA: 'Los Angeles' };

const STATE_BY_NAME = new Map(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]));

function sensitive(kind: PatternKind, value: string): LocationPattern {
  return { kind, value, caseSensitive: true };
}

function insensitive(kind: PatternKind, value: string): LocationPattern {
  return { kind, value, caseSensitive: false };
}

/** A code after a comma: "Long Beach, CA", "Los Angeles, CA, USA", "Austin, TX (USA)". */
function codePatterns(code: string): LocationPattern[] {
  return [
    sensitive('endsWith', `, ${code}`),
    sensitive('contains', `, ${code},`),
    sensitive('contains', `, ${code} `),
    sensitive('contains', `, ${code})`),
  ];
}

/**
 * A region or country named in full, as a whole part of the location:
 * ", Kansas" must not be found inside "Arkansas", nor "Virginia" inside "West Virginia".
 */
function namePatterns(name: string): LocationPattern[] {
  return [
    insensitive('equals', name),
    insensitive('startsWith', `${name},`),
    insensitive('startsWith', `${name} (`),
    insensitive('endsWith', `, ${name}`),
    insensitive('contains', `, ${name},`),
    insensitive('contains', `, ${name} `),
    insensitive('contains', `(${name})`),
  ];
}

/** A city named alone, or followed only by its country. */
function bareCityPatterns(city: string): LocationPattern[] {
  return [
    insensitive('equals', city),
    insensitive('equals', `${city}, USA`),
    insensitive('equals', `${city}, United States`),
    insensitive('startsWith', `${city} (`),
  ];
}

/** A short name (three letters or fewer) as a word: "Rio" must not be found inside "Ontario". */
function wordPatterns(word: string): LocationPattern[] {
  return [
    insensitive('equals', word),
    insensitive('startsWith', `${word},`),
    insensitive('startsWith', `${word} `),
    insensitive('endsWith', `, ${word}`),
    insensitive('endsWith', ` ${word}`),
    insensitive('contains', `, ${word},`),
    insensitive('contains', ` ${word} `),
    insensitive('contains', ` ${word},`),
    insensitive('contains', `(${word})`),
  ];
}

function textPatterns(text: string): LocationPattern[] {
  return text.length <= 3 ? wordPatterns(text) : [insensitive('contains', text)];
}

function statePatterns(code: string): LocationPattern[] {
  const patterns = [...codePatterns(code), ...namePatterns(US_STATES[code])];
  for (const city of US_CITIES_BY_STATE[code] ?? []) patterns.push(...bareCityPatterns(city));
  if (code === 'DC') {
    patterns.push(insensitive('contains', 'Washington, D.C'), insensitive('contains', 'Washington DC'), insensitive('contains', 'Washington D.C'));
  }
  if (CODE_ALSO_A_CITY[code]) patterns.push(insensitive('contains', CODE_ALSO_A_CITY[code]));
  return patterns;
}

function unitedStatesPatterns(): LocationPattern[] {
  const patterns: LocationPattern[] = [
    sensitive('contains', 'USA'),
    sensitive('contains', 'U.S.'),
    sensitive('equals', 'US'),
    sensitive('endsWith', ', US'),
    sensitive('contains', ', US '),
    sensitive('contains', ', US,'),
    insensitive('contains', 'United States'),
  ];
  for (const [code, name] of Object.entries(US_STATES)) {
    patterns.push(...codePatterns(code), insensitive('endsWith', `, ${name}`), insensitive('contains', `, ${name},`));
  }
  for (const cities of Object.values(US_CITIES_BY_STATE)) {
    for (const city of cities) patterns.push(...bareCityPatterns(city));
  }
  return patterns;
}

function unitedKingdomPatterns(): LocationPattern[] {
  return [...codePatterns('UK'), sensitive('contains', '(UK)'), ...UK_NAMES.flatMap(namePatterns)];
}

function canadaPatterns(): LocationPattern[] {
  return [
    ...namePatterns('Canada'),
    ...Object.entries(CANADIAN_PROVINCES).flatMap(([code, name]) => [...codePatterns(code), ...namePatterns(name)]),
  ];
}

/** The US states a typed place names, by alias, two-letter code or full name; none when it names no state. */
function stateCodes(key: string): readonly string[] {
  if (STATE_ALIASES[key]) return STATE_ALIASES[key];
  const code = key.toUpperCase();
  if (key.length === 2 && US_STATES[code]) return [code];
  const byName = STATE_BY_NAME.get(key);
  return byName ? [byName] : [];
}

/** "Austin, TX" typed whole (a URL can carry it; the input box splits on commas): the city part. */
const CITY_WITH_STATE = /^(.+?),\s*([A-Za-z]{2})$/;

/** A typed place, or null when nothing was typed. */
export function parsePlace(raw: string): PlaceQuery | null {
  const input = raw.trim().replace(/\s+/g, ' ');
  if (!input) return null;
  const key = input.toLowerCase().replace(/\.+$/, '');

  if (COUNTRY_US.has(key)) return { input, searchText: 'United States', patterns: unitedStatesPatterns() };
  if (COUNTRY_UK.has(key)) return { input, searchText: 'United Kingdom', patterns: unitedKingdomPatterns() };
  if (key === 'canada') return { input, searchText: 'Canada', patterns: canadaPatterns() };

  const codes = stateCodes(key);
  if (codes.length > 0) {
    const searchText = codes.length > 1 ? input : codes[0] === 'DC' ? 'Washington, DC' : US_STATES[codes[0]];
    return { input, searchText, patterns: codes.flatMap(statePatterns) };
  }

  const aliases = PLACE_ALIASES[key];
  if (aliases) return { input, searchText: aliases[0], patterns: aliases.flatMap(textPatterns) };

  const cityWithState = CITY_WITH_STATE.exec(input);
  if (cityWithState && US_STATES[cityWithState[2].toUpperCase()]) {
    return { input, searchText: input, patterns: textPatterns(cityWithState[1].trim()) };
  }

  return { input, searchText: input, patterns: textPatterns(input) };
}

/** Every typed place that names something. */
export function parsePlaces(inputs: readonly string[]): PlaceQuery[] {
  return inputs.map(parsePlace).filter((place): place is PlaceQuery => place !== null);
}

export function matchesPattern(location: string, pattern: LocationPattern): boolean {
  const text = pattern.caseSensitive ? location : location.toLowerCase();
  const value = pattern.caseSensitive ? pattern.value : pattern.value.toLowerCase();
  switch (pattern.kind) {
    case 'equals':
      return text === value;
    case 'startsWith':
      return text.startsWith(value);
    case 'endsWith':
      return text.endsWith(value);
    case 'contains':
      return text.includes(value);
  }
}

/** True when the row's location is in any of the places. A row with no location is in none. */
export function locationMatches(location: string | null | undefined, places: readonly PlaceQuery[]): boolean {
  if (!location) return false;
  return places.some((place) => place.patterns.some((pattern) => matchesPattern(location, pattern)));
}
