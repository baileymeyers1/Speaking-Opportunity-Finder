import { describe, it, expect } from 'vitest';
import {
  AUTO_LINK_SCORE,
  REVIEW_SCORE,
  autoLinkObjection,
  classifyScore,
  distinctiveTokens,
  parenthesisedAcronyms,
  deriveEditionYear,
  displayName,
  isHostingDomain,
  nameSimilarity,
  nameTokens,
  normalizeEventName,
  registrableDomain,
  scoreCandidate,
  slugify,
} from './eventMatching.js';
import { DIFFERENT_EVENT_PAIRS, SAME_EVENT_PAIRS, row } from './__fixtures__/eventPairs.js';

describe('normalizeEventName', () => {
  it('strips years, two-digit years and edition ordinals but keeps conference-type words', () => {
    expect(normalizeEventName('BSides Rocket City 2027')).toBe('bsides rocket city');
    expect(normalizeEventName("DevFest Dutse '26")).toBe('devfest dutse');
    expect(normalizeEventName('12th IEEE European Symposium on Security and Privacy')).toBe(
      'ieee european symposium on security and privacy'
    );
    expect(normalizeEventName('Cloud Native Summit 2027')).toBe('cloud native summit');
    expect(normalizeEventName('.HACK Conference 2027')).toBe('hack conference');
  });

  it('strips a year glued to a word and a trailing edition number', () => {
    expect(normalizeEventName('BSidesCharm2027')).toBe('bsidescharm');
    expect(normalizeEventName('ScanAgile27')).toBe('scanagile');
    expect(normalizeEventName('SecretCon 5 (2027)')).toBe('secretcon');
    expect(normalizeEventName('"12 Reasons Why" with Tech Experts - Season 2')).toBe('12 reasons why with tech experts season');
  });

  it('drops filler words, punctuation, diacritics and extra spaces', () => {
    expect(normalizeEventName('DevFest 2026: Nova Scotia Edition')).toBe('devfest nova scotia');
    expect(normalizeEventName('Colorado Applied Machine Learning  Mini Conference')).toBe(
      'colorado applied machine learning mini conference'
    );
    expect(normalizeEventName('DevFest Côte d’Ivoire 2026 (Yamoussoukro)')).toBe('devfest cote d ivoire yamoussoukro');
    expect(normalizeEventName('OWASP Global AppSec US 2026 - CFP (San Francisco) : Call for Sessions')).toBe(
      'owasp global appsec us san francisco'
    );
  });

  it('returns an empty string for a name that is nothing but filler', () => {
    expect(normalizeEventName('Call for Papers')).toBe('');
    expect(normalizeEventName('2027')).toBe('');
  });
});

describe('displayName and slugify', () => {
  it('keeps the original casing but drops the year and edition markers', () => {
    expect(displayName('BSides Rocket City 2027')).toBe('BSides Rocket City');
    expect(displayName('SecretCon 5 (2027)')).toBe('SecretCon');
    expect(displayName('FOSDEM 2027')).toBe('FOSDEM');
    expect(displayName("DevFest New Cairo '26")).toBe('DevFest New Cairo');
  });

  it('falls back to the title when stripping would leave nothing', () => {
    expect(displayName('Call for Papers')).toBe('Call for Papers');
  });

  it('slugifies the normalized name', () => {
    expect(slugify('BSides Rocket City 2027')).toBe('bsides-rocket-city');
    expect(slugify('DevFest Côte d’Ivoire 2026')).toBe('devfest-cote-d-ivoire');
  });
});

describe('registrableDomain', () => {
  it('drops subdomains and www', () => {
    expect(registrableDomain('https://cfp.bsidesprg.cz/2027/cfp')).toBe('bsidesprg.cz');
    expect(registrableDomain('https://www.oaiconference.com')).toBe('oaiconference.com');
    expect(registrableDomain('https://2027.rustweek.org')).toBe('rustweek.org');
    expect(registrableDomain('https://talks.devopsdays.org/devopsdays-atlanta-2027/cfp')).toBe('devopsdays.org');
  });

  it('keeps two-level public suffixes', () => {
    expect(registrableDomain('https://cfp.example.co.uk/x')).toBe('example.co.uk');
    expect(registrableDomain('https://www.example.com.au')).toBe('example.com.au');
  });

  it('returns null for an unparsable URL', () => {
    expect(registrableDomain('not a url')).toBeNull();
    expect(registrableDomain('')).toBeNull();
  });

  it('knows the shared CFP and ticketing platforms', () => {
    expect(isHostingDomain('sessionize.com')).toBe(true);
    expect(isHostingDomain('pretalx.com')).toBe(true);
    expect(isHostingDomain('meetup.com')).toBe(true);
    expect(isHostingDomain('linuxfoundation.org')).toBe(true);
    expect(isHostingDomain('bsidesrocketcity.org')).toBe(false);
  });
});

describe('deriveEditionYear', () => {
  it('prefers the event date, then a four-digit year in the title, then a two-digit year', () => {
    expect(deriveEditionYear({ title: 'FOSDEM 2027', eventDate: new Date('2027-01-30') })).toBe(2027);
    expect(deriveEditionYear({ title: 'FOSDEM 2027', eventDate: null })).toBe(2027);
    expect(deriveEditionYear({ title: "DevFest Dutse '26", eventDate: null })).toBe(2026);
    expect(deriveEditionYear({ title: 'ScanAgile27', eventDate: null })).toBe(2027);
  });

  it('returns null when nothing states the year', () => {
    expect(deriveEditionYear({ title: 'BSides Rocket City', eventDate: null })).toBeNull();
    expect(deriveEditionYear({ title: '"12 Reasons Why" with Tech Experts', eventDate: null })).toBeNull();
  });
});

describe('nameSimilarity', () => {
  it('is 1 for the same name in different years and 0 for unrelated names', () => {
    expect(nameSimilarity('FOSDEM 2026', 'FOSDEM 2027')).toBe(1);
    expect(nameSimilarity('PyCon DE 2027', 'RustWeek 2027')).toBe(0);
  });

  it('is 0 when either name is empty after normalization', () => {
    expect(nameSimilarity('Call for Papers', 'Call for Papers')).toBe(0);
  });

  it('ranks a subset name above a sibling with a different city', () => {
    const subset = nameSimilarity('BSides Prague', 'BSides Prague Czechia 2027');
    const sibling = nameSimilarity('.NET Conf 2026 Amravati', '.NET Conf 2026 Pune');
    expect(subset).toBeGreaterThan(sibling);
  });

  it('exposes the tokens the candidate lookup matches on, without filler', () => {
    expect(nameTokens('DevFest 2026: Nova Scotia Edition')).toEqual(['devfest', 'nova', 'scotia']);
    expect(nameTokens('Call for Papers')).toEqual([]);
  });
});

describe('parenthesisedAcronyms and distinctiveTokens', () => {
  it('reads acronyms out of parentheses without their year', () => {
    expect(parenthesisedAcronyms('2026 4th International Conference on Power and Renewable Energy Engineering (PREE 2026)')).toEqual(['PREE']);
    expect(parenthesisedAcronyms('European Power Platform Conference (EPPC27)')).toEqual(['EPPC']);
    expect(parenthesisedAcronyms('Global Gaming Expo (G2E)')).toEqual(['G2E']);
    expect(parenthesisedAcronyms('The WEI International Academic Conference (WEI-TSE-Miami 2027)')).toEqual(['WEI-TSE-MIAMI']);
    expect(parenthesisedAcronyms('SecretCon 5 (2027)')).toEqual([]);
    expect(parenthesisedAcronyms('.NET Conf 2026 Pune (In-Person)')).toEqual([]);
  });

  it('keeps only the words that tell events apart', () => {
    expect(distinctiveTokens('Law Conferences in California 2026-2027')).toEqual(['law', 'california']);
    expect(distinctiveTokens('Annual Conference')).toEqual([]);
    expect(distinctiveTokens('DynamicsCon Regional: Midwest USA 2027')).toEqual(['dynamicscon', 'midwest']);
  });
});

describe('autoLinkObjection', () => {
  const [, law, medical] = DIFFERENT_EVENT_PAIRS.find(([label]) => label.startsWith('Directory rows: Law'))!;
  const [, pree, repe] = DIFFERENT_EVENT_PAIRS.find(([label]) => label.startsWith('PREE'))!;
  const [, adoh, hybrid] = DIFFERENT_EVENT_PAIRS.find(([label]) => label.startsWith('ADOH'))!;
  const [, annual, caa] = DIFFERENT_EVENT_PAIRS.find(([label]) => label.startsWith('"Annual'))!;
  const [, aws, cordoba] = DIFFERENT_EVENT_PAIRS.find(([label]) => label.startsWith('AWS Student'))!;

  it('names what is wrong with each production false positive', () => {
    expect(autoLinkObjection(law, medical)).toBe('distinctive words differ');
    expect(autoLinkObjection(pree, repe)).toBe('acronyms differ');
    expect(autoLinkObjection(adoh, hybrid)).toMatch(/^extra words: /);
    expect(autoLinkObjection(annual, caa)).toBe('nothing distinctive');
    expect(autoLinkObjection(aws, cordoba)).toBe('cities differ');
  });

  it('accepts an extra word that names the place or the acronym of the same event', () => {
    const [, ninjas, norway] = SAME_EVENT_PAIRS.find(([label]) => label.startsWith('Workplace Ninjas'))!;
    const [, g2e, gaming] = SAME_EVENT_PAIRS.find(([label]) => label.startsWith('Global Gaming'))!;
    const [, midwest, midwestUsa] = [
      '',
      row('DynamicsCon Regional Midwest 2027', 'https://sessionize.com/dynamicscon-regional-midwest-USA/', '2027-08-31', { location: 'Columbus, OH (USA)' }),
      row('DynamicsCon Regional: Midwest USA 2027', 'https://www.eventbrite.com/e/dynamicscon-regional-midwest-usa-tickets-2000484907209', '2027-08-31', { location: 'Columbus, Ohio, United States' }),
    ];
    expect(autoLinkObjection(ninjas, norway)).toBeNull();
    expect(autoLinkObjection(g2e, gaming)).toBeNull();
    expect(autoLinkObjection(midwest, midwestUsa)).toBeNull();
  });

  it('lets a city edition link when the other row does not say where it is', () => {
    expect(autoLinkObjection({ ...aws, location: null }, cordoba)).toBeNull();
  });
});

describe('scoreCandidate', () => {
  it.each(SAME_EVENT_PAIRS)('links %s', (_label, a, b) => {
    const score = scoreCandidate(a, b);
    expect(score, `score ${score.toFixed(3)}`).toBeGreaterThanOrEqual(AUTO_LINK_SCORE);
    expect(scoreCandidate(b, a)).toBeCloseTo(score, 6);
  });

  it.each(DIFFERENT_EVENT_PAIRS)('does not auto-link %s', (_label, a, b) => {
    const score = scoreCandidate(a, b);
    expect(score, `score ${score.toFixed(3)}`).toBeLessThan(AUTO_LINK_SCORE);
  });

  it('puts React Summit vs React Summit Asia in the review band, not below it', () => {
    const [, a, b] = DIFFERENT_EVENT_PAIRS[0];
    expect(classifyScore(scoreCandidate(a, b))).toBe('review');
  });

  it('puts unrelated conferences below the review band', () => {
    const score = scoreCandidate(
      row('PyCon DE 2027', 'https://pretalx.com/pyconde-2027/cfp', '2027-04-20'),
      row('RustWeek 2027', 'https://2027.rustweek.org', '2027-05-23')
    );
    expect(classifyScore(score)).toBe('none');
  });

  it('rewards a shared event domain and penalises two different event sites', () => {
    const shared = scoreCandidate(
      row('Devopsdays Geneva', 'https://devopsdays-geneva.ch/cfp_submit.php', '2027-05-25'),
      row('DevOpsDays Geneva 2027', 'https://www.devopsdays-geneva.ch/', '2027-05-25')
    );
    const different = scoreCandidate(
      row('Devopsdays Geneva', 'https://devopsdays-geneva.ch/cfp_submit.php', '2027-05-25'),
      row('DevOpsDays Geneva 2027', 'https://www.geneva-devops.example', '2027-05-25')
    );
    expect(shared).toBeGreaterThan(different);
    expect(shared).toBeGreaterThanOrEqual(AUTO_LINK_SCORE);
  });

  it('treats a date roughly a year apart as a recurring edition, not a mismatch', () => {
    const annual = scoreCandidate(
      row('KCD Texas', 'https://pretalx.com/kcd-texas-2026/cfp', '2026-04-24'),
      row('KCD Texas 2027', 'https://pretalx.com/kcd-texas-2027/cfp', '2027-04-23')
    );
    const odd = scoreCandidate(
      row('KCD Texas', 'https://pretalx.com/kcd-texas-2026/cfp', '2026-04-24'),
      row('KCD Texas 2027', 'https://pretalx.com/kcd-texas-2027/cfp', '2026-10-23')
    );
    expect(annual).toBeGreaterThan(odd);
    expect(annual).toBeGreaterThanOrEqual(AUTO_LINK_SCORE);
  });

  it('scores a name with no date or location on the name alone', () => {
    const score = scoreCandidate(
      row('JNation', 'https://sessionize.com/jnation-2027/', null),
      row('JNation 2027', 'https://jnation.pt', null)
    );
    expect(score).toBeGreaterThanOrEqual(AUTO_LINK_SCORE);
  });

  it('never auto-links on context alone when the names are only loosely alike', () => {
    const [, a, b] = DIFFERENT_EVENT_PAIRS.find(([label]) => label.startsWith('University of Riverside: Summer'))!;
    expect(nameSimilarity(a.title, b.title)).toBeLessThan(0.7);
    // Same organizer, same site, same city, a month apart: still only a review candidate.
    expect(classifyScore(scoreCandidate(a, b))).toBe('review');
  });

  it('keeps the production false positives in the review band for the admin list', () => {
    for (const [label, a, b] of DIFFERENT_EVENT_PAIRS.filter(([l]) => /^(Directory rows|PREE|Renewable|ADOH|"Annual|AWS Student)/.test(l))) {
      expect(classifyScore(scoreCandidate(a, b)), label).toBe('review');
    }
  });

  it('has a review band between the two thresholds', () => {
    expect(REVIEW_SCORE).toBeLessThan(AUTO_LINK_SCORE);
    expect(classifyScore(AUTO_LINK_SCORE)).toBe('auto');
    expect(classifyScore(REVIEW_SCORE)).toBe('review');
    expect(classifyScore(REVIEW_SCORE - 0.001)).toBe('none');
  });
});
