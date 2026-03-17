import { describe, it, expect } from 'vitest';
import { computeQualityScore, ScraperResult } from './index.js';

function makeResult(overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    title: 'Test Conference',
    organization: 'Test Org',
    isRemote: false,
    format: 'conference',
    industries: [],
    applyUrl: 'https://example.com/apply',
    source: 'test-source',
    ...overrides,
  };
}

describe('computeQualityScore', () => {
  it('barebones result scores ≤ 15', () => {
    const result = makeResult();
    expect(computeQualityScore(result)).toBeLessThanOrEqual(15);
  });

  it('complete result with real description scores ≥ 80', () => {
    const result = makeResult({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-15'),
      location: 'San Francisco, CA',
      industries: ['Technology', 'AI'],
      compensationType: 'paid',
      description: 'This is a detailed conference about cutting-edge technology topics including AI, machine learning, and distributed systems. Speakers will present 30-minute talks to an audience of 500+ engineers and technical leaders from around the world.',
      source: 'papercall.io',
    });
    expect(computeQualityScore(result)).toBeGreaterThanOrEqual(80);
  });

  it('placeholder descriptions score lower than real descriptions', () => {
    const shared: Partial<ScraperResult> = {
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-15'),
      location: 'Austin, TX',
      industries: ['Technology'],
    };

    const placeholder = makeResult({
      ...shared,
      description: 'Submit your talk proposal for our upcoming conference event happening next year with many great speakers and attendees from around the world attending the sessions and workshops planned for this great event.',
    });

    const real = makeResult({
      ...shared,
      description: 'Join 2,000 engineers for 3 days of deep-dive technical talks on distributed systems, observability, and platform engineering. Each speaker gets a 40-minute slot plus Q&A. Travel and hotel covered for all accepted speakers.',
    });

    expect(computeQualityScore(placeholder)).toBeLessThan(computeQualityScore(real));
  });

  it('trusted sources score higher than untrusted', () => {
    const base: Partial<ScraperResult> = {
      cfpDeadline: new Date('2026-06-01'),
      industries: ['Technology'],
    };

    const trusted = makeResult({ ...base, source: 'papercall.io' });
    const untrusted = makeResult({ ...base, source: 'random-blog.com' });

    expect(computeQualityScore(trusted)).toBeGreaterThan(computeQualityScore(untrusted));
  });

  it('deadline adds ≥ 20 points', () => {
    const without = makeResult();
    const with_ = makeResult({ cfpDeadline: new Date('2026-06-01') });

    expect(computeQualityScore(with_) - computeQualityScore(without)).toBeGreaterThanOrEqual(20);
  });

  it('caps score at 100', () => {
    const result = makeResult({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-15'),
      location: 'San Francisco, CA',
      industries: ['Technology', 'AI', 'Cloud'],
      compensationType: 'paid',
      compensationAmount: 5000,
      description: 'A very detailed and long description that covers everything about this amazing conference with detailed speaker benefits and audience information repeated to be very long indeed for testing purposes and more.',
      source: 'papercall.io',
    });
    expect(computeQualityScore(result)).toBeLessThanOrEqual(100);
  });

  it('mid-range differentiation: low < mid < high with ≥ 30 spread', () => {
    const low = makeResult({
      description: 'Short.',
      source: 'unknown-source',
    });

    const mid = makeResult({
      cfpDeadline: new Date('2026-06-01'),
      industries: ['Technology'],
      description: 'A moderately detailed description that gives some context about the conference and what speakers can expect.',
      source: 'test-source',
    });

    const high = makeResult({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-15'),
      location: 'New York, NY',
      industries: ['Technology', 'AI'],
      compensationType: 'paid',
      description: 'This premier technology conference brings together 3,000 developers, architects, and CTOs for three days of technical deep dives. Each speaker receives full travel coverage, a $2,000 honorarium, and complimentary conference access.',
      source: 'papercall.io',
    });

    const lowScore = computeQualityScore(low);
    const midScore = computeQualityScore(mid);
    const highScore = computeQualityScore(high);

    expect(lowScore).toBeLessThan(midScore);
    expect(midScore).toBeLessThan(highScore);
    expect(highScore - lowScore).toBeGreaterThanOrEqual(30);
  });

  it('filters out generic industries like "events" and "cross-industry"', () => {
    const generic = makeResult({ industries: ['Events', 'Cross-Industry', 'General'] });
    const specific = makeResult({ industries: ['Technology', 'Healthcare'] });

    expect(computeQualityScore(generic)).toBeLessThan(computeQualityScore(specific));
  });

  it('scales industry points based on count up to cap', () => {
    const one = makeResult({ industries: ['Technology'] });
    const two = makeResult({ industries: ['Technology', 'AI'] });
    const five = makeResult({ industries: ['Technology', 'AI', 'Cloud', 'DevOps', 'Security'] });

    const oneScore = computeQualityScore(one);
    const twoScore = computeQualityScore(two);
    const fiveScore = computeQualityScore(five);

    expect(twoScore).toEqual(oneScore + 5);
    // Cap at 10 — three and five industries should score the same
    expect(fiveScore).toEqual(twoScore);
  });
});
