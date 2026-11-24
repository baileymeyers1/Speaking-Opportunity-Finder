/**
 * Place names the location filter knows: US states and Canadian provinces by
 * code and name, and the larger US cities, so a row stored as a bare city
 * ("San Diego") still counts as in its state. Read by `location.ts`.
 */

/** US state (and DC) codes to names. Extraction stores a US place as "City, ST". */
export const US_STATES: Readonly<Record<string, string>> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

/** Canadian province and territory codes to names. None of the codes is also a US state's. */
export const CANADIAN_PROVINCES: Readonly<Record<string, string>> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};

/**
 * Larger US cities by state, for rows that name the city alone. A city in two
 * states is listed under both: the filter would rather show one row too many.
 */
export const US_CITIES_BY_STATE: Readonly<Record<string, readonly string[]>> = {
  AZ: ['Phoenix', 'Scottsdale', 'Tucson', 'Tempe', 'Mesa'],
  CA: [
    'Los Angeles', 'San Diego', 'San Francisco', 'San Jose', 'Sacramento', 'Oakland', 'Long Beach',
    'Anaheim', 'Fresno', 'Irvine', 'Pasadena', 'Santa Monica', 'Palo Alto', 'Mountain View',
    'Santa Clara', 'Sunnyvale', 'Berkeley', 'Palm Springs', 'Monterey', 'Riverside', 'Bakersfield',
  ],
  CO: ['Denver', 'Boulder', 'Colorado Springs'],
  DC: ['Washington DC', 'Washington D.C.'],
  FL: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale'],
  GA: ['Atlanta', 'Savannah'],
  IL: ['Chicago'],
  IN: ['Indianapolis'],
  KS: ['Wichita', 'Kansas City'],
  LA: ['New Orleans'],
  ME: ['Portland'],
  MA: ['Boston', 'Cambridge'],
  MD: ['Baltimore'],
  MI: ['Detroit', 'Grand Rapids'],
  MN: ['Minneapolis', 'Saint Paul', 'St. Paul'],
  MO: ['St. Louis', 'Kansas City'],
  NC: ['Charlotte', 'Raleigh', 'Durham'],
  NV: ['Las Vegas', 'Reno'],
  NY: ['New York', 'New York City', 'Brooklyn', 'Manhattan', 'Buffalo', 'Rochester'],
  OH: ['Columbus', 'Cleveland', 'Cincinnati'],
  OR: ['Portland'],
  PA: ['Philadelphia', 'Pittsburgh'],
  TN: ['Nashville', 'Memphis'],
  TX: ['Austin', 'Dallas', 'Houston', 'San Antonio', 'Fort Worth', 'El Paso'],
  UT: ['Salt Lake City'],
  WA: ['Seattle', 'Spokane', 'Bellevue'],
  WI: ['Milwaukee', 'Madison'],
};
