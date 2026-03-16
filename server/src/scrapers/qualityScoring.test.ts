import { describe, it, expect } from 'vitest';
import { computeQualityScore, ScraperResult } from './index.js';

function makeMinimalOpportunity(overrides: Partial<ScraperResult> = {}): ScraperResult {
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
  it('gives base score of 20 for minimal opportunity', () => {
    const result = makeMinimalOpportunity();
    expect(computeQualityScore(result)).toBe(20);
  });

  it('adds 20 points for cfpDeadline', () => {
    const result = makeMinimalOpportunity({
      cfpDeadline: new Date('2026-06-01'),
    });
    expect(computeQualityScore(result)).toBe(40);
  });

  it('adds 15 points for eventDate', () => {
    const result = makeMinimalOpportunity({
      eventDate: new Date('2026-09-15'),
    });
    expect(computeQualityScore(result)).toBe(35);
  });

  it('adds 10 points for location', () => {
    const result = makeMinimalOpportunity({
      location: 'San Francisco, CA',
    });
    expect(computeQualityScore(result)).toBe(30);
  });

  it('adds 10 points for non-empty industries', () => {
    const result = makeMinimalOpportunity({
      industries: ['Technology', 'AI'],
    });
    expect(computeQualityScore(result)).toBe(30);
  });

  it('adds 10 points for compensationType', () => {
    const result = makeMinimalOpportunity({
      compensationType: 'paid',
    });
    expect(computeQualityScore(result)).toBe(30);
  });

  it('adds 10 points for compensationAmount', () => {
    const result = makeMinimalOpportunity({
      compensationAmount: 500,
    });
    expect(computeQualityScore(result)).toBe(30);
  });

  it('adds 10 points for description longer than 120 chars', () => {
    const result = makeMinimalOpportunity({
      description: 'A'.repeat(121),
    });
    expect(computeQualityScore(result)).toBe(30);
  });

  it('does not add points for short description', () => {
    const result = makeMinimalOpportunity({
      description: 'Short desc',
    });
    expect(computeQualityScore(result)).toBe(20);
  });

  it('gives trusted source bonus of 5 for papercall.io', () => {
    const result = makeMinimalOpportunity({
      source: 'papercall.io',
    });
    expect(computeQualityScore(result)).toBe(25);
  });

  it('gives trusted source bonus of 5 for confs.tech', () => {
    const result = makeMinimalOpportunity({
      source: 'confs.tech',
    });
    expect(computeQualityScore(result)).toBe(25);
  });

  it('gives trusted source bonus of 5 for wikicfp.com', () => {
    const result = makeMinimalOpportunity({
      source: 'wikicfp.com',
    });
    expect(computeQualityScore(result)).toBe(25);
  });

  it('gives trusted source bonus of 5 for callingallpapers.com', () => {
    const result = makeMinimalOpportunity({
      source: 'callingallpapers.com',
    });
    expect(computeQualityScore(result)).toBe(25);
  });

  it('gives trusted source bonus of 5 for javaconferences.org', () => {
    const result = makeMinimalOpportunity({
      source: 'javaconferences.org',
    });
    expect(computeQualityScore(result)).toBe(25);
  });

  it('gives max score for complete opportunity with trusted source', () => {
    const result = makeMinimalOpportunity({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-15'),
      location: 'San Francisco, CA',
      industries: ['Technology', 'AI'],
      compensationType: 'paid',
      description: 'A'.repeat(200),
      source: 'papercall.io',
    });
    // 20 base + 20 cfp + 15 event + 10 location + 10 industries + 10 comp + 10 desc + 5 source = 100
    expect(computeQualityScore(result)).toBe(100);
  });

  it('caps score at 100', () => {
    // Even if all fields are present with trusted source, max is 100
    const result = makeMinimalOpportunity({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-15'),
      location: 'San Francisco, CA',
      industries: ['Technology'],
      compensationType: 'paid',
      compensationAmount: 1000,
      description: 'A'.repeat(200),
      source: 'papercall.io',
    });
    expect(computeQualityScore(result)).toBeLessThanOrEqual(100);
  });

  it('does not give source bonus for unknown sources', () => {
    const result = makeMinimalOpportunity({
      source: 'random-blog.com',
    });
    expect(computeQualityScore(result)).toBe(20);
  });
});
