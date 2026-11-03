import { describe, it, expect } from 'vitest';
import { buildCreateData, buildUpdateData, type ExistingOpportunityRow } from './persistData.js';
import type { ScraperResult } from './qualityScore.js';

function makeScraped(overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    title: 'DevConf 2027 - Call for Speakers',
    organization: 'DevConf',
    description: 'Raw scraped description that is long enough to count for something here.',
    location: undefined,
    isRemote: false,
    eventDate: undefined,
    cfpDeadline: new Date('2027-01-15T00:00:00Z'),
    format: 'conference',
    industries: ['technology'],
    applyUrl: 'https://devconf.example/cfp',
    source: 'confs.tech',
    sourceUrl: 'https://confs.tech',
    ...overrides,
  };
}

function makeExisting(overrides: Partial<ExistingOpportunityRow> = {}): ExistingOpportunityRow {
  return {
    title: 'DevConf 2027',
    organization: 'DevConf Foundation',
    description: 'Older description',
    location: 'Brno, Czech Republic',
    isRemote: true,
    eventDate: new Date('2027-06-01T00:00:00Z'),
    cfpDeadline: new Date('2027-02-01T00:00:00Z'),
    deadlineTimezone: null,
    format: 'conference',
    industries: JSON.stringify(['open source', 'linux']),
    compensationType: 'travel',
    compensationAmount: null,
    compensationDetails: 'Travel covered',
    source: 'confs.tech',
    sourceUrl: 'https://confs.tech',
    enrichmentStatus: 'enriched',
    isClosed: false,
    isRelevant: true,
    ...overrides,
  };
}

const ENRICHMENT_OWNED_KEYS = [
  'enrichmentStatus',
  'enrichedAt',
  'enrichmentError',
  'enrichmentAttempts',
  'enrichmentClaimedAt',
  'isClosed',
  'isRelevant',
];

describe('buildUpdateData', () => {
  it('never writes enrichment bookkeeping or applyUrl', () => {
    const data = buildUpdateData(makeScraped(), makeExisting());
    for (const key of ENRICHMENT_OWNED_KEYS) {
      expect(data).not.toHaveProperty(key);
    }
    expect(data).not.toHaveProperty('applyUrl');
  });

  it('keeps Claude-enriched values when the row is enriched', () => {
    const data = buildUpdateData(makeScraped(), makeExisting());
    expect(data.title).toBe('DevConf 2027');
    expect(data.organization).toBe('DevConf Foundation');
    expect(data.location).toBe('Brno, Czech Republic');
    expect(data.eventDate).toEqual(new Date('2027-06-01T00:00:00Z'));
    expect(data.cfpDeadline).toEqual(new Date('2027-02-01T00:00:00Z'));
    expect(JSON.parse(data.industries)).toEqual(['open source', 'linux']);
    expect(data.compensationType).toBe('travel');
    expect(data.isRemote).toBe(true);
  });

  it('fills gaps on an enriched row from the new scrape', () => {
    const existing = makeExisting({ location: null, cfpDeadline: null, industries: '[]' });
    const data = buildUpdateData(makeScraped({ location: 'Prague' }), existing);
    expect(data.location).toBe('Prague');
    expect(data.cfpDeadline).toEqual(new Date('2027-01-15T00:00:00Z'));
    expect(JSON.parse(data.industries)).toEqual(['technology']);
  });

  it('moves the deadline timezone together with the deadline it qualifies', () => {
    const scraped = makeScraped({ cfpDeadline: new Date('2027-01-16T04:59:59Z'), deadlineTimezone: 'America/Denver' });
    const enriched = makeExisting({ cfpDeadline: new Date('2027-02-01T11:59:59Z'), deadlineTimezone: 'AoE' });
    expect(buildUpdateData(scraped, enriched)).toMatchObject({
      cfpDeadline: new Date('2027-02-01T11:59:59Z'),
      deadlineTimezone: 'AoE',
    });
    expect(buildUpdateData(scraped, makeExisting({ cfpDeadline: null, deadlineTimezone: null }))).toMatchObject({
      cfpDeadline: new Date('2027-01-16T04:59:59Z'),
      deadlineTimezone: 'America/Denver',
    });
    expect(buildUpdateData(scraped, makeExisting({ enrichmentStatus: null }))).toMatchObject({
      deadlineTimezone: 'America/Denver',
    });
    expect(buildCreateData(makeScraped({ cfpDeadline: undefined, deadlineTimezone: 'UTC' })).deadlineTimezone).toBeNull();
  });

  it('refreshes the raw description even on an enriched row', () => {
    const data = buildUpdateData(makeScraped(), makeExisting());
    expect(data.description).toMatch(/^Raw scraped description/);
  });

  it('lets the scrape overwrite everything when the row is not enriched', () => {
    for (const status of [null, 'failed', 'skipped']) {
      const data = buildUpdateData(makeScraped(), makeExisting({ enrichmentStatus: status }));
      expect(data.title).toBe('DevConf 2027 - Call for Speakers');
      expect(data.location).toBeNull();
      expect(data.eventDate).toBeNull();
      expect(data.cfpDeadline).toEqual(new Date('2027-01-15T00:00:00Z'));
      expect(JSON.parse(data.industries)).toEqual(['technology']);
      expect(data.isRemote).toBe(false);
    }
  });

  it('forces quality to 0 when the existing row is closed or irrelevant', () => {
    expect(buildUpdateData(makeScraped(), makeExisting({ isClosed: true })).qualityScore).toBe(0);
    expect(buildUpdateData(makeScraped(), makeExisting({ isRelevant: false })).qualityScore).toBe(0);
    expect(buildUpdateData(makeScraped(), makeExisting()).qualityScore).toBeGreaterThan(0);
  });

  it('computes the quality score from the merged row, not the raw scrape', () => {
    // Scrape alone has no location/eventDate; the enriched row has both.
    const merged = buildUpdateData(makeScraped(), makeExisting());
    const fresh = buildUpdateData(makeScraped(), makeExisting({ enrichmentStatus: null }));
    expect(merged.qualityScore).toBeGreaterThan(fresh.qualityScore);
  });

  it('infers compensation from the description when the scraper gave none', () => {
    const scraped = makeScraped({ description: 'Speakers receive an honorarium of $500 plus travel.' });
    const data = buildUpdateData(scraped, makeExisting({ enrichmentStatus: null, compensationType: null }));
    expect(data.compensationType).toBe('honorarium');
    expect(data.compensationAmount).toBe(500);
  });
});

describe('buildCreateData', () => {
  it('includes applyUrl and no enrichment bookkeeping', () => {
    const data = buildCreateData(makeScraped());
    expect(data.applyUrl).toBe('https://devconf.example/cfp');
    for (const key of ENRICHMENT_OWNED_KEYS) {
      expect(data).not.toHaveProperty(key);
    }
    expect(JSON.parse(data.industries)).toEqual(['technology']);
    expect(data.qualityScore).toBeGreaterThan(0);
  });

  it('respects a scraper-provided quality score', () => {
    expect(buildCreateData(makeScraped({ qualityScore: 77 })).qualityScore).toBe(77);
  });
});
