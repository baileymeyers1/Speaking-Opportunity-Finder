import { describe, it, expect } from 'vitest';
import { planEnrichment, shouldSkipEnrichment } from './enrichmentService.js';
import type { ScraperResult } from '../scrapers/qualityScore.js';

function row(overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    title: 'Conf',
    organization: 'Org',
    description: 'Call for speakers',
    isRemote: false,
    format: 'conference',
    industries: [],
    applyUrl: 'https://example.test/cfp',
    source: 'confs.tech',
    ...overrides,
  };
}

describe('shouldSkipEnrichment', () => {
  it('skips rows that already have every field', () => {
    const complete = row({
      cfpDeadline: new Date(),
      eventDate: new Date(),
      industries: ['ai'],
      location: 'Denver, CO',
      compensationType: 'travel',
    });
    expect(shouldSkipEnrichment(complete)).toBe('already complete');
  });

  it('skips a short description when there is no page text', () => {
    expect(shouldSkipEnrichment(row({ description: 'Submit' }))).toBe('description too short');
  });

  it('does not skip a short description when the page was fetched', () => {
    expect(shouldSkipEnrichment(row({ description: 'Submit' }), 'a'.repeat(200))).toBeNull();
  });
});

describe('planEnrichment', () => {
  it('closes the listing when the page is gone, without extracting', () => {
    expect(planEnrichment(row(), { ok: false, reason: 'gone', status: 404, message: 'HTTP 404' })).toEqual({
      action: 'closed',
      reason: 'HTTP 404',
    });
  });

  it('extracts from the page text when the fetch succeeded', () => {
    expect(planEnrichment(row(), { ok: true, text: 'Deadline Dec 1 '.repeat(5), status: 200 })).toEqual({
      action: 'extract',
      pageText: 'Deadline Dec 1 '.repeat(5),
      pageError: null,
    });
  });

  it('falls back to the description when the fetch failed for another reason', () => {
    expect(planEnrichment(row({ description: 'Long enough description of the call for speakers' }), {
      ok: false,
      reason: 'timeout',
      message: 'Timed out after 8000ms',
    })).toEqual({ action: 'extract', pageText: null, pageError: 'Timed out after 8000ms' });
  });

  it('skips when the fetch failed and the description is too short', () => {
    expect(planEnrichment(row({ description: 'Submit' }), { ok: false, reason: 'network', message: 'fetch failed' })).toEqual({
      action: 'skip',
      reason: 'description too short',
    });
  });
});
