import { describe, it, expect } from 'vitest';
import { locationMatches, parsePlace, parsePlaces } from './location.js';

function matches(input: string, location: string | null): boolean {
  return locationMatches(location, parsePlaces([input]));
}

describe('parsePlace', () => {
  it('ignores an empty entry', () => {
    expect(parsePlace('  ')).toBeNull();
    expect(parsePlaces(['', ' California '])).toHaveLength(1);
  });

  it('names a state in full for a web search, whichever way it was typed', () => {
    expect(parsePlace('CA')?.searchText).toBe('California');
    expect(parsePlace('california')?.searchText).toBe('California');
    expect(parsePlace('usa')?.searchText).toBe('United States');
    expect(parsePlace('uk')?.searchText).toBe('United Kingdom');
    expect(parsePlace('Berlin')?.searchText).toBe('Berlin');
    expect(parsePlace('nyc')?.searchText).toBe('New York');
  });
});

describe('a US state', () => {
  const inCalifornia = [
    'Long Beach, CA',
    'Los Angeles, CA, USA',
    'Long Beach, CA (USA)',
    'Sacramento, California',
    'Sacramento, California, United States',
    'California, USA',
    'San Diego',
    'san diego',
    'San Diego, USA',
  ];
  const notInCalifornia = [
    'Toronto, Canada',
    'Chicago, IL',
    'Caen, France',
    'San José, Costa Rica',
    'Casablanca, Morocco',
    'Abomey-Calavi, Benin',
    'Online',
  ];

  it.each(['California', 'california', 'CA', 'ca', 'Calif.'])('%s finds every way a California place is written', (input) => {
    for (const location of inCalifornia) expect(matches(input, location), `${input} vs ${location}`).toBe(true);
    for (const location of notInCalifornia) expect(matches(input, location), `${input} vs ${location}`).toBe(false);
  });

  it('matches a state code only as a code, not inside another word', () => {
    expect(matches('NY', 'Albany, NY')).toBe(true);
    expect(matches('NY', 'New York')).toBe(true);
    expect(matches('NY', 'Berlin, Germany')).toBe(false);
    expect(matches('NY', 'Munich (Germany)')).toBe(false);
    expect(matches('WA', 'Seattle, WA')).toBe(true);
    expect(matches('WA', 'Warsaw, Poland')).toBe(false);
    expect(matches('WA', 'Ottawa, Canada')).toBe(false);
  });

  it('does not take one state for another whose name contains it', () => {
    expect(matches('Kansas', 'Wichita, Kansas')).toBe(true);
    expect(matches('Kansas', 'Wichita, KS')).toBe(true);
    expect(matches('Kansas', 'Little Rock, Arkansas')).toBe(false);
    expect(matches('Virginia', 'Richmond, VA')).toBe(true);
    expect(matches('Virginia', 'Charleston, West Virginia')).toBe(false);
    expect(matches('Virginia', 'Charleston, WV')).toBe(false);
  });

  it('reads Washington as the state and as the capital', () => {
    expect(matches('Washington', 'Seattle, WA')).toBe(true);
    expect(matches('Washington', 'Washington, DC')).toBe(true);
    expect(matches('Washington', 'Washington, D.C., United States')).toBe(true);
    expect(matches('DC', 'Washington, DC')).toBe(true);
    expect(matches('DC', 'Seattle, WA')).toBe(false);
  });

  it('reads LA as Louisiana and as Los Angeles', () => {
    expect(matches('LA', 'New Orleans, LA')).toBe(true);
    expect(matches('LA', 'Los Angeles, CA')).toBe(true);
    expect(matches('LA', 'Lagos, Nigeria')).toBe(false);
  });
});

describe('a country', () => {
  it.each(['USA', 'US', 'United States', 'united states of america', 'U.S.'])('%s finds US places however they are written', (input) => {
    for (const location of ['Austin, TX', 'Milwaukee, USA', 'San Antonio, United States', 'Sacramento, California', 'California, US', 'US', 'Chicago', 'Austin, TX (USA)']) {
      expect(matches(input, location), `${input} vs ${location}`).toBe(true);
    }
    for (const location of ['London, UK', 'Toronto, Canada', 'Paris, France', 'Kyiv, Ukraine']) {
      expect(matches(input, location), `${input} vs ${location}`).toBe(false);
    }
  });

  it('finds the United Kingdom by any of its names, but not New South Wales or Ukraine', () => {
    for (const location of ['London, UK', 'Glasgow, UK', 'Manchester, United Kingdom', 'Cardiff, Wales', 'Edinburgh, Scotland', 'Leeds, England']) {
      expect(matches('UK', location), location).toBe(true);
    }
    expect(matches('UK', 'Sydney, New South Wales')).toBe(false);
    expect(matches('UK', 'Kyiv, Ukraine')).toBe(false);
  });

  it('finds Canada by name or by province', () => {
    for (const location of ['Toronto, Canada', 'Vancouver, BC', 'Montreal, QC', 'Ottawa, Ontario']) {
      expect(matches('Canada', location), location).toBe(true);
    }
    expect(matches('Canada', 'Long Beach, CA')).toBe(false);
  });
});

describe('any other place', () => {
  it('matches a city or country named anywhere in the location', () => {
    expect(matches('Berlin', 'Berlin, Germany')).toBe(true);
    expect(matches('germany', 'Munich (Germany)')).toBe(true);
    expect(matches('Paris', 'Paris, France')).toBe(true);
    expect(matches('Berlin', 'Munich, Germany')).toBe(false);
  });

  it('spells out common city nicknames', () => {
    expect(matches('nyc', 'New York, NY')).toBe(true);
    expect(matches('sf', 'San Francisco, CA')).toBe(true);
    expect(matches('Bay Area', 'Oakland, CA')).toBe(true);
    expect(matches('Bay Area', 'Los Angeles, CA')).toBe(false);
  });

  it('matches a short name as a word only', () => {
    expect(matches('Rio', 'Rio, Brazil')).toBe(true);
    expect(matches('Rio', 'Ontario, Canada')).toBe(false);
  });

  it('matches nothing when the row has no location', () => {
    expect(matches('California', null)).toBe(false);
    expect(matches('California', '')).toBe(false);
  });

  it('matches when any of several places does', () => {
    const places = parsePlaces(['Texas', 'Berlin']);
    expect(locationMatches('Austin, TX', places)).toBe(true);
    expect(locationMatches('Berlin, Germany', places)).toBe(true);
    expect(locationMatches('Long Beach, CA', places)).toBe(false);
    expect(locationMatches('Long Beach, CA', [])).toBe(false);
  });
});
