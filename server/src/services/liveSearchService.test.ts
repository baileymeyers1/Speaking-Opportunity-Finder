import { describe, it, expect } from 'vitest';
import { applyExtractionToLiveResult, type EnrichedLiveResult } from './liveSearchService.js';
import type { ExtractionResult } from './extraction.js';

const NOW = new Date('2026-11-02T12:00:00Z');

function makeResult(overrides: Partial<EnrichedLiveResult> = {}): EnrichedLiveResult {
  return {
    id: 'live-test',
    title: 'Test Conference',
    organization: 'Test Org',
    description: 'A test conference',
    location: null,
    isRemote: false,
    eventDate: null,
    cfpDeadline: null,
    format: 'conference',
    industries: [],
    compensationType: null,
    compensationAmount: null,
    compensationDetails: null,
    applyUrl: 'https://example.com',
    qualityScore: 20,
    source: 'Live Search',
    sourceUrl: 'https://example.com',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    isLiveResult: true,
    liveSearchUrl: 'https://example.com',
    ...overrides,
  };
}

function extraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    eventDate: null,
    cfpDeadline: null,
    location: null,
    isRemote: false,
    isClosed: false,
    isRelevant: true,
    compensationType: null,
    compensationAmount: null,
    format: 'conference',
    industries: [],
    cleanTitle: null,
    cleanOrganization: null,
    confidence: { eventDate: 'high', cfpDeadline: 'high', location: 'high' },
    ...overrides,
  };
}

describe('applyExtractionToLiveResult', () => {
  it('overwrites regex location with the extracted location', () => {
    const result = makeResult({ location: 'Los Angeles' });
    applyExtractionToLiveResult(result, extraction({ location: 'Boston, MA' }), NOW);
    expect(result.location).toBe('Boston, MA');
  });

  it('writes dates back as ISO strings', () => {
    const result = makeResult({ eventDate: '2026-01-01T00:00:00.000Z' });
    applyExtractionToLiveResult(
      result,
      extraction({ eventDate: new Date('2027-09-15T00:00:00Z'), cfpDeadline: new Date('2027-06-01T00:00:00Z') }),
      NOW
    );
    expect(result.eventDate).toBe('2027-09-15T00:00:00.000Z');
    expect(result.cfpDeadline).toBe('2027-06-01T00:00:00.000Z');
  });

  it('does not clear fields the extraction left null', () => {
    const result = makeResult({ location: 'Chicago, IL', eventDate: '2026-05-01T00:00:00.000Z', format: 'podcast' });
    applyExtractionToLiveResult(result, extraction({ format: 'podcast' }), NOW);
    expect(result.location).toBe('Chicago, IL');
    expect(result.eventDate).toBe('2026-05-01T00:00:00.000Z');
    expect(result.format).toBe('podcast');
  });

  it('flags closed and irrelevant results instead of faking a past deadline', () => {
    const result = makeResult();
    applyExtractionToLiveResult(result, extraction({ isClosed: true, isRelevant: false }), NOW);
    expect(result.isClosed).toBe(true);
    expect(result.isRelevant).toBe(false);
    expect(result.cfpDeadline).toBeNull();
  });

  it('marks a result closed when its extracted deadline is past', () => {
    const result = makeResult();
    applyExtractionToLiveResult(result, extraction({ cfpDeadline: new Date('2026-01-01T00:00:00Z') }), NOW);
    expect(result.isClosed).toBe(true);
  });

  it('applies format, remote flag, industries, titles and confidence', () => {
    const result = makeResult();
    applyExtractionToLiveResult(
      result,
      extraction({
        format: 'workshop',
        isRemote: true,
        industries: ['ai', 'healthcare'],
        cleanTitle: 'Clean Title',
        cleanOrganization: 'Clean Org',
        confidence: { eventDate: 'low', cfpDeadline: 'medium', location: 'high' },
      }),
      NOW
    );
    expect(result.format).toBe('workshop');
    expect(result.isRemote).toBe(true);
    expect(result.industries).toEqual(['ai', 'healthcare']);
    expect(result.title).toBe('Clean Title');
    expect(result.organization).toBe('Clean Org');
    expect(result.dateConfidence).toEqual({ eventDate: 'low', cfpDeadline: 'medium', location: 'high' });
  });
});
