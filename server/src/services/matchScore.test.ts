import { describe, expect, it } from 'vitest';
import {
  computeMatchScore,
  MATCH_SORT_CANDIDATE_CAP,
  scoreOpportunities,
  topicMatches,
  type MatchCandidate,
  type MatchProfile,
} from './matchScore.js';

const NOW = new Date('2026-11-03T12:00:00Z');

function profile(overrides: Partial<MatchProfile> = {}): MatchProfile {
  return {
    topics: [],
    seniority: 'experienced',
    homeCity: null,
    homeCountry: null,
    travelRadius: 'international',
    remotePreference: 'either',
    compensationRequirement: 'any',
    preferredFormats: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    title: 'Cloud Native Days',
    description: 'A two-day conference on platform engineering and observability.',
    industries: ['technology', 'devops'],
    location: 'Denver, CO',
    isRemote: false,
    format: 'conference',
    compensationType: 'travel',
    qualityScore: 70,
    cfpDeadline: new Date('2027-01-15T00:00:00Z'),
    verifiedAt: new Date('2026-11-01T00:00:00Z'),
    dateConfidence: { eventDate: 'high', cfpDeadline: 'high', location: 'high' },
    ...overrides,
  };
}

const denverSpeaker = profile({
  topics: ['devops', 'healthcare'],
  homeCity: 'Denver',
  homeCountry: 'United States',
  travelRadius: 'country',
  compensationRequirement: 'travel_covered',
  preferredFormats: ['conference'],
});

describe('topicMatches', () => {
  it('matches case-insensitively on whole words, including a plural', () => {
    expect(topicMatches('healthcare', 'Healthcare Technology')).toBe(true);
    expect(topicMatches('AI', 'Applied AI Summit')).toBe(true);
    expect(topicMatches('podcast', 'Looking for podcasts guests')).toBe(true);
    expect(topicMatches('machine learning', 'Machine-Learning track')).toBe(true);
  });

  it('does not match inside another word', () => {
    expect(topicMatches('ai', 'How we maintain our pipelines')).toBe(false);
    expect(topicMatches('art', 'Smart contracts')).toBe(false);
  });
});

describe('computeMatchScore', () => {
  it('scores a profile whose topics, city, pay and format all fit near the top', () => {
    const result = computeMatchScore(denverSpeaker, candidate(), NOW);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.reasons).toEqual(['matches: devops', 'in Denver', 'travel covered', 'conference format']);
    expect(result.misses).toEqual([]);
  });

  it('scores an empty profile only on quality, with nothing to explain', () => {
    expect(computeMatchScore(profile(), candidate({ qualityScore: 62 }), NOW)).toEqual({
      score: 62,
      reasons: [],
      misses: [],
    });
    expect(computeMatchScore(profile(), candidate({ qualityScore: null }), NOW).score).toBe(50);
  });

  it('penalises an in-person row for a remote-only speaker and says why', () => {
    const remoteOnly = profile({ topics: ['devops'], remotePreference: 'remote_only' });
    const inPerson = computeMatchScore(remoteOnly, candidate({ location: 'Berlin, Germany' }), NOW);
    const remote = computeMatchScore(remoteOnly, candidate({ location: 'Berlin, Germany', isRemote: true }), NOW);
    expect(inPerson.misses).toContain('in-person in Berlin, Germany, you prefer remote');
    expect(remote.reasons).toContain('remote');
    expect(remote.score - inPerson.score).toBeGreaterThanOrEqual(25);
  });

  it('treats a US "City, ST" location as inside the United States', () => {
    const usOnly = profile({ homeCity: 'Austin', homeCountry: 'United States', travelRadius: 'country' });
    const inside = computeMatchScore(usOnly, candidate({ location: 'Denver, CO' }), NOW);
    const outside = computeMatchScore(usOnly, candidate({ location: 'Lisbon, Portugal' }), NOW);
    expect(inside.reasons).toContain('within United States');
    expect(outside.misses).toContain('in-person in Lisbon, Portugal, outside United States');
    expect(inside.score).toBeGreaterThan(outside.score);
  });

  it('keeps a local-only speaker at home', () => {
    const local = profile({ homeCity: 'Denver', homeCountry: 'United States', travelRadius: 'local' });
    const home = computeMatchScore(local, candidate({ location: 'Denver, CO' }), NOW);
    const away = computeMatchScore(local, candidate({ location: 'Chicago, IL' }), NOW);
    expect(home.reasons).toContain('in Denver');
    expect(away.misses).toContain('in-person in Chicago, IL, you only travel locally');
    expect(home.score).toBeGreaterThan(away.score);
  });

  it('matches topics against industries, title and description, listing what hit', () => {
    const speaker = profile({ topics: ['Healthcare', 'observability', 'rust'] });
    const result = computeMatchScore(speaker, candidate({ industries: ['healthcare technology'] }), NOW);
    expect(result.reasons[0]).toBe('matches: healthcare, observability');
    const none = computeMatchScore(speaker, candidate({ industries: ['finance'], description: null }), NOW);
    expect(none.misses).toContain('no topic overlap');
    expect(result.score).toBeGreaterThan(none.score);
  });

  it('explains compensation misses in the speaker’s terms and treats unknown pay as neutral', () => {
    const paidOnly = profile({ compensationRequirement: 'paid' });
    expect(computeMatchScore(paidOnly, candidate({ compensationType: 'exposure' }), NOW).misses).toContain(
      'unpaid, you need a paid slot'
    );
    expect(computeMatchScore(paidOnly, candidate({ compensationType: 'travel' }), NOW).misses).toContain(
      'travel only, you need a paid slot'
    );
    expect(computeMatchScore(paidOnly, candidate({ compensationType: 'paid' }), NOW).reasons).toContain('paid');
    const unknown = computeMatchScore(paidOnly, candidate({ compensationType: null }), NOW);
    expect(unknown.misses).toEqual([]);
    expect(unknown.reasons).toEqual([]);
  });

  it('flags a format outside the preferred ones', () => {
    const podcaster = profile({ preferredFormats: ['podcast', 'webinar'] });
    const result = computeMatchScore(podcaster, candidate({ format: 'conference' }), NOW);
    expect(result.misses).toContain('conference, you prefer podcast or webinar');
  });

  it('takes small penalties for a near deadline, an approximate deadline and an unverified row', () => {
    const base = computeMatchScore(denverSpeaker, candidate(), NOW);
    const soon = computeMatchScore(denverSpeaker, candidate({ cfpDeadline: new Date('2026-11-05T00:00:00Z') }), NOW);
    expect(soon.misses).toContain('deadline in 2 days');
    expect(base.score - soon.score).toBe(10);

    const approximate = computeMatchScore(
      denverSpeaker,
      candidate({ dateConfidence: { eventDate: 'high', cfpDeadline: 'low', location: 'high' } }),
      NOW
    );
    expect(approximate.misses).toContain('deadline is approximate');
    expect(base.score - approximate.score).toBe(5);

    const unverified = computeMatchScore(denverSpeaker, candidate({ verifiedAt: null }), NOW);
    expect(unverified.misses).toContain('not yet verified');
    expect(base.score - unverified.score).toBe(3);
  });

  it('blends the quality score in at a fixed weight', () => {
    const high = computeMatchScore(denverSpeaker, candidate({ qualityScore: 100 }), NOW);
    const low = computeMatchScore(denverSpeaker, candidate({ qualityScore: 0 }), NOW);
    expect(high.score - low.score).toBe(20);
  });

  it('returns an integer in 0..100 and accepts ISO strings for dates', () => {
    const worst = profile({
      topics: ['quantum'],
      remotePreference: 'remote_only',
      compensationRequirement: 'paid',
      preferredFormats: ['podcast'],
    });
    const result = computeMatchScore(
      worst,
      candidate({
        compensationType: 'exposure',
        qualityScore: 0,
        verifiedAt: null,
        cfpDeadline: '2026-11-04T00:00:00Z',
        dateConfidence: { eventDate: 'low', cfpDeadline: 'low', location: 'low' },
      }),
      NOW
    );
    expect(result.score).toBe(0);
    expect(Number.isInteger(result.score)).toBe(true);
  });
});

describe('scoreOpportunities', () => {
  it('attaches score, reasons and misses to every item and sorts best first when asked', () => {
    const items = [
      candidate({ title: 'Weak', industries: ['finance'], location: 'Lisbon, Portugal', compensationType: 'exposure' }),
      candidate({ title: 'Strong' }),
    ];
    const scored = scoreOpportunities(denverSpeaker, items, NOW, { sort: true });
    expect(scored.map((item) => item.title)).toEqual(['Strong', 'Weak']);
    expect(scored[0].matchScore).toBeGreaterThan(scored[1].matchScore);
    expect(scored[0].matchReasons.length).toBeGreaterThan(0);
    expect(scored[1].matchMisses.length).toBeGreaterThan(0);
  });

  it('breaks ties by the sooner deadline', () => {
    const later = candidate({ title: 'Later', cfpDeadline: new Date('2027-03-01T00:00:00Z') });
    const sooner = candidate({ title: 'Sooner', cfpDeadline: new Date('2027-02-01T00:00:00Z') });
    const scored = scoreOpportunities(denverSpeaker, [later, sooner], NOW, { sort: true });
    expect(scored.map((item) => item.title)).toEqual(['Sooner', 'Later']);
  });

  it('caps the in-memory candidate set at 500 rows', () => {
    expect(MATCH_SORT_CANDIDATE_CAP).toBe(500);
  });
});
