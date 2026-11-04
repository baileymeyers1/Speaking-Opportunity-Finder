import { describe, it, expect } from 'vitest';
import {
  buildExtractionPrompt,
  EXTRACTION_SCHEMA,
  mergeExtraction,
  parseDateConfidence,
  parseExtractionOutput,
  serializeDateConfidence,
  type ExtractionResult,
} from './extraction.js';
import type { ScraperResult } from '../scrapers/qualityScore.js';

const NOW = new Date('2026-11-02T12:00:00Z');

function fullOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventDate: '2027-05-04',
    cfpDeadline: '2026-12-01',
    cfpDeadlineTime: null,
    deadlineTimezone: null,
    location: 'Boston, MA',
    isRemote: false,
    isClosed: false,
    isRelevant: true,
    compensationType: 'travel',
    compensationAmount: null,
    format: 'conference',
    industries: ['Healthcare', 'AI'],
    cleanTitle: 'HealthTech Summit 2027',
    cleanOrganization: 'HealthTech Alliance',
    confidence: { eventDate: 'high', cfpDeadline: 'high', location: 'medium' },
    ...overrides,
  };
}

function extraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  const parsed = parseExtractionOutput(fullOutput());
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...parsed.result, ...overrides };
}

function scraped(overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    title: 'HealthTech Summit | Call for Speakers',
    organization: 'Unknown',
    description: 'Submit your talk',
    location: 'Los Angeles',
    isRemote: false,
    eventDate: new Date('2026-01-01T00:00:00Z'),
    cfpDeadline: undefined,
    format: 'conference',
    industries: ['technology'],
    compensationType: undefined,
    applyUrl: 'https://example.com/cfp',
    source: 'confs.tech',
    ...overrides,
  };
}

describe('EXTRACTION_SCHEMA', () => {
  it('requires every property and forbids extras, as structured outputs need', () => {
    expect(EXTRACTION_SCHEMA.additionalProperties).toBe(false);
    expect([...EXTRACTION_SCHEMA.required].sort()).toEqual(Object.keys(EXTRACTION_SCHEMA.properties).sort());
    expect(EXTRACTION_SCHEMA.properties.confidence.additionalProperties).toBe(false);
  });
});

describe('buildExtractionPrompt', () => {
  it('includes today, the computed years, the title and both text sources', () => {
    const prompt = buildExtractionPrompt(
      { title: 'DevConf', organization: 'Dev Org', description: 'listing text', pageText: 'page text', applyUrl: 'https://x.test' },
      NOW
    );
    expect(prompt).toContain("Today's date is 2026-11-02");
    expect(prompt).toContain('assume 2026 if that month has not passed yet, otherwise 2027');
    expect(prompt).toContain('cfpDeadline 2026-09-21 and eventDate 2027-05-04');
    expect(prompt).toContain('never infer it from the venue');
    expect(prompt).toContain('Title: DevConf');
    expect(prompt).toContain('listing text');
    expect(prompt).toContain('page text');
    expect(prompt).toContain('https://x.test');
  });

  it('says when the page could not be fetched and truncates long text', () => {
    const prompt = buildExtractionPrompt({ title: 'X', description: 'a'.repeat(5000) }, NOW);
    expect(prompt).toContain('the page could not be fetched');
    expect(prompt).not.toContain('a'.repeat(1201));
  });
});

describe('parseExtractionOutput', () => {
  it('parses a complete response', () => {
    const parsed = parseExtractionOutput(fullOutput());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.eventDate?.toISOString()).toBe('2027-05-04T00:00:00.000Z');
    // A date with no stated zone is read as Anywhere on Earth: it ends at 11:59:59 UTC the next day.
    expect(parsed.result.cfpDeadline?.toISOString()).toBe('2026-12-02T11:59:59.000Z');
    expect(parsed.result.deadlineTimezone).toBeNull();
    expect(parsed.result.location).toBe('Boston, MA');
    expect(parsed.result.compensationType).toBe('travel');
    expect(parsed.result.industries).toEqual(['healthcare', 'ai']);
    expect(parsed.result.cleanTitle).toBe('HealthTech Summit 2027');
    expect(parsed.result.confidence).toEqual({ eventDate: 'high', cfpDeadline: 'high', location: 'medium' });
  });

  it('places the deadline at the stated time in the stated zone', () => {
    const chicago = parseExtractionOutput(fullOutput({ cfpDeadlineTime: '17:00', deadlineTimezone: 'America/Chicago' }));
    if (!chicago.ok) throw new Error(chicago.error);
    expect(chicago.result.cfpDeadline?.toISOString()).toBe('2026-12-01T23:00:00.000Z');
    expect(chicago.result.deadlineTimezone).toBe('America/Chicago');

    const aoe = parseExtractionOutput(fullOutput({ deadlineTimezone: 'AoE' }));
    if (!aoe.ok) throw new Error(aoe.error);
    expect(aoe.result.cfpDeadline?.toISOString()).toBe('2026-12-02T11:59:59.000Z');
    expect(aoe.result.deadlineTimezone).toBe('AoE');
  });

  it('drops a zone it cannot resolve and a time it cannot read, keeping the day', () => {
    const parsed = parseExtractionOutput(fullOutput({ cfpDeadlineTime: '25:99', deadlineTimezone: 'Pacific Time' }));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.result.deadlineTimezone).toBeNull();
    expect(parsed.result.cfpDeadline?.toISOString()).toBe('2026-12-02T11:59:59.000Z');
  });

  it('does not report a zone without a deadline', () => {
    const parsed = parseExtractionOutput(fullOutput({ cfpDeadline: null, deadlineTimezone: 'UTC' }));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.result.cfpDeadline).toBeNull();
    expect(parsed.result.deadlineTimezone).toBeNull();
  });

  it('rejects non-object output', () => {
    expect(parseExtractionOutput('not json').ok).toBe(false);
    expect(parseExtractionOutput(null).ok).toBe(false);
    expect(parseExtractionOutput([1]).ok).toBe(false);
  });

  it('drops impossible dates and marks them low confidence', () => {
    const parsed = parseExtractionOutput(fullOutput({ cfpDeadline: '3000-01-01', eventDate: '1800-01-01' }));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.result.cfpDeadline).toBeNull();
    expect(parsed.result.eventDate).toBeNull();
    expect(parsed.result.confidence.cfpDeadline).toBe('low');
    expect(parsed.result.confidence.eventDate).toBe('low');
  });

  it('drops unparseable date strings', () => {
    const parsed = parseExtractionOutput(fullOutput({ eventDate: 'not-a-date' }));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.result.eventDate).toBeNull();
  });

  it('treats null, empty and the string "null" as absent', () => {
    const parsed = parseExtractionOutput(
      fullOutput({ cfpDeadline: 'null', eventDate: null, location: 'null', cleanTitle: '', compensationType: 'null' })
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.result.cfpDeadline).toBeNull();
    expect(parsed.result.eventDate).toBeNull();
    expect(parsed.result.location).toBeNull();
    expect(parsed.result.cleanTitle).toBeNull();
    expect(parsed.result.compensationType).toBeNull();
  });

  it('falls back for unknown enum values and non-array industries', () => {
    const parsed = parseExtractionOutput(
      fullOutput({ format: 'hackathon', compensationType: 'free lunch', industries: 'Technology', confidence: { eventDate: 'sure' } })
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.result.format).toBe('other');
    expect(parsed.result.compensationType).toBeNull();
    expect(parsed.result.industries).toEqual([]);
    expect(parsed.result.confidence).toEqual({ eventDate: 'low', cfpDeadline: 'low', location: 'low' });
  });

  it('defaults isRelevant to true and the other booleans to false when missing', () => {
    const parsed = parseExtractionOutput({});
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.result.isRelevant).toBe(true);
    expect(parsed.result.isClosed).toBe(false);
    expect(parsed.result.isRemote).toBe(false);
  });

  it('keeps only positive numeric compensation amounts', () => {
    const ok = parseExtractionOutput(fullOutput({ compensationAmount: 500 }));
    const bad = parseExtractionOutput(fullOutput({ compensationAmount: '500' }));
    const zero = parseExtractionOutput(fullOutput({ compensationAmount: 0 }));
    if (!ok.ok || !bad.ok || !zero.ok) throw new Error('parse failed');
    expect(ok.result.compensationAmount).toBe(500);
    expect(bad.result.compensationAmount).toBeNull();
    expect(zero.result.compensationAmount).toBeNull();
  });
});

describe('mergeExtraction', () => {
  it('lets extracted values overwrite scraped ones', () => {
    const merged = mergeExtraction(scraped(), extraction(), NOW);
    expect(merged.title).toBe('HealthTech Summit 2027');
    expect(merged.organization).toBe('HealthTech Alliance');
    expect(merged.location).toBe('Boston, MA');
    expect(merged.eventDate?.toISOString()).toBe('2027-05-04T00:00:00.000Z');
    expect(merged.cfpDeadline?.toISOString()).toBe('2026-12-02T11:59:59.000Z');
    expect(merged.deadlineTimezone).toBeNull();
    expect(merged.industries).toEqual(['healthcare', 'ai']);
    expect(merged.compensationType).toBe('travel');
    expect(merged.isClosed).toBe(false);
    expect(merged.isRelevant).toBe(true);
    expect(merged.dateConfidence).toEqual({ eventDate: 'high', cfpDeadline: 'high', location: 'medium' });
  });

  it('keeps existing values when the extraction returned null', () => {
    const merged = mergeExtraction(
      scraped({
        location: 'Chicago, IL',
        cfpDeadline: new Date('2026-12-16T04:59:59Z'),
        deadlineTimezone: 'America/Chicago',
        compensationType: 'paid',
      }),
      extraction({ location: null, cfpDeadline: null, eventDate: null, cleanTitle: null, cleanOrganization: null, compensationType: null, industries: [] }),
      NOW
    );
    expect(merged.location).toBe('Chicago, IL');
    expect(merged.cfpDeadline?.toISOString()).toBe('2026-12-16T04:59:59.000Z');
    expect(merged.deadlineTimezone).toBe('America/Chicago');
    expect(merged.eventDate?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(merged.title).toBe('HealthTech Summit | Call for Speakers');
    expect(merged.organization).toBe('Unknown');
    expect(merged.compensationType).toBe('paid');
    expect(merged.industries).toEqual(['technology']);
  });

  it('marks the listing closed when the merged deadline instant is already past', () => {
    const merged = mergeExtraction(
      scraped(),
      extraction({ cfpDeadline: new Date('2026-11-02T11:00:00Z'), deadlineTimezone: 'UTC', isClosed: false }),
      NOW
    );
    expect(merged.isClosed).toBe(true);
    expect(mergeExtraction(scraped(), extraction({ cfpDeadline: new Date('2026-10-02T11:59:59Z') }), NOW).isClosed).toBe(true);
  });

  it('keeps a deadline open until its instant, and reads a legacy midnight value as AoE end of day', () => {
    const later = mergeExtraction(scraped(), extraction({ cfpDeadline: new Date('2026-11-02T13:00:00Z'), deadlineTimezone: 'UTC' }), NOW);
    expect(later.isClosed).toBe(false);
    // NOW is 12:00 UTC on Nov 2: a bare "Nov 2" deadline still has until 11:59:59 UTC on Nov 3.
    const legacy = mergeExtraction(scraped({ cfpDeadline: new Date('2026-11-02T00:00:00Z') }), extraction({ cfpDeadline: null }), NOW);
    expect(legacy.isClosed).toBe(false);
    expect(legacy.cfpDeadline?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('replaces the zone together with the deadline', () => {
    const merged = mergeExtraction(
      scraped({ cfpDeadline: new Date('2026-12-16T04:59:59Z'), deadlineTimezone: 'America/Chicago' }),
      extraction({ cfpDeadline: new Date('2027-01-02T11:59:59Z'), deadlineTimezone: null }),
      NOW
    );
    expect(merged.cfpDeadline?.toISOString()).toBe('2027-01-02T11:59:59.000Z');
    expect(merged.deadlineTimezone).toBeNull();
  });

  it('respects an explicit closed flag even with a future deadline', () => {
    const merged = mergeExtraction(scraped(), extraction({ isClosed: true }), NOW);
    expect(merged.isClosed).toBe(true);
  });

  it('keeps a low-confidence date and reports the confidence', () => {
    const merged = mergeExtraction(
      scraped(),
      extraction({ confidence: { eventDate: 'low', cfpDeadline: 'high', location: 'high' } }),
      NOW
    );
    expect(merged.eventDate?.toISOString()).toBe('2027-05-04T00:00:00.000Z');
    expect(merged.dateConfidence.eventDate).toBe('low');
  });

  it('takes the extracted remote flag and format', () => {
    const merged = mergeExtraction(scraped({ isRemote: false, format: 'conference' }), extraction({ isRemote: true, format: 'workshop' }), NOW);
    expect(merged.isRemote).toBe(true);
    expect(merged.format).toBe('workshop');
  });

  it('propagates irrelevance', () => {
    expect(mergeExtraction(scraped(), extraction({ isRelevant: false }), NOW).isRelevant).toBe(false);
  });
});

describe('date confidence serialization', () => {
  it('round-trips through the JSON column', () => {
    const confidence = { eventDate: 'high', cfpDeadline: 'low', location: 'medium' } as const;
    expect(parseDateConfidence(serializeDateConfidence(confidence))).toEqual(confidence);
  });

  it('returns null for missing or malformed values', () => {
    expect(serializeDateConfidence(null)).toBeNull();
    expect(parseDateConfidence(null)).toBeNull();
    expect(parseDateConfidence('{nope')).toBeNull();
  });
});
