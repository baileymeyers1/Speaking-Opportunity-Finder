import { describe, it, expect } from 'vitest';
import {
  buildEnrichmentUpdate,
  buildGoneUpdate,
  buildVerificationErrorUpdate,
  buildVerificationUpdate,
  verificationCandidates,
  verificationWindows,
} from './verification.js';
import type { MergedOpportunity } from './extraction.js';
import { SEARCH_SOURCES } from './searchSources.js';

const NOW = new Date('2026-11-02T15:30:00Z');

function merged(overrides: Partial<MergedOpportunity> = {}): MergedOpportunity {
  return {
    title: 'Conf',
    organization: 'Org',
    description: 'A long enough description of the call for speakers to count for scoring purposes.',
    location: 'Denver, CO',
    isRemote: false,
    eventDate: new Date('2027-04-20T00:00:00Z'),
    cfpDeadline: new Date('2027-01-15T00:00:00Z'),
    format: 'conference',
    industries: ['devops'],
    sectors: ['cloud-devops'],
    compensationType: 'travel',
    compensationAmount: 800,
    applyUrl: 'https://example.test/cfp',
    source: 'confs.tech',
    isClosed: false,
    isRelevant: true,
    hasOpenCall: true,
    dateConfidence: { eventDate: 'high', cfpDeadline: 'low', location: 'high' },
    payToPresent: null,
    callUrl: null,
    ...overrides,
  };
}

describe('verificationWindows', () => {
  it('computes the 14-day deadline window and the 2- and 7-day staleness cutoffs', () => {
    const windows = verificationWindows(NOW);
    expect(windows.today.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(windows.deadlineSoonUntil.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(windows.soonStaleBefore.toISOString()).toBe('2026-10-31T15:30:00.000Z');
    expect(windows.staleBefore.toISOString()).toBe('2026-10-26T15:30:00.000Z');
    expect(windows.unreadableGiveUpBefore.toISOString()).toBe('2026-10-03T15:30:00.000Z');
  });
});

describe('verificationCandidates', () => {
  it('checks deadlines within 14 days first, then stale rows oldest first', () => {
    const [soon, stale] = verificationCandidates(NOW);
    expect(soon.label).toBe('deadline-soon');
    expect(soon.orderBy).toEqual({ cfpDeadline: 'asc' });
    expect(JSON.stringify(soon.where)).toContain('"cfpDeadline":{"gte":"2026-11-02T00:00:00.000Z","lte":"2026-11-16T00:00:00.000Z"}');
    expect(JSON.stringify(soon.where)).toContain('"verifiedAt":{"lt":"2026-10-31T15:30:00.000Z"}');

    expect(stale.label).toBe('stale');
    expect(stale.orderBy).toEqual({ verifiedAt: { sort: 'asc', nulls: 'first' } });
    expect(JSON.stringify(stale.where)).toContain('"verifiedAt":{"lt":"2026-10-26T15:30:00.000Z"}');
  });

  it('only considers visible rows that enrichment has already handled', () => {
    for (const candidate of verificationCandidates(NOW)) {
      const where = JSON.stringify(candidate.where);
      expect(where).toContain('"isClosed":false');
      expect(where).toContain('"isRelevant":true');
      expect(where).toContain('"enrichmentStatus":{"not":null}');
      expect(where).toContain('"enrichmentClaimedAt":null');
    }
  });

  it('leaves out rows with no deadline whose event has happened', () => {
    for (const candidate of verificationCandidates(NOW)) {
      expect(JSON.stringify(candidate.where)).toContain(
        '{"OR":[{"cfpDeadline":{"not":null}},{"eventDate":null},{"eventDate":{"gte":"2026-11-02T00:00:00.000Z"}}]}'
      );
    }
  });

  it('stops retrying a search hit that could not be read for a month', () => {
    expect(SEARCH_SOURCES).toEqual(expect.arrayContaining(['Live Search', 'Linkup Search', 'Followed Link', 'thetradeshowcalendar.com']));
    for (const candidate of verificationCandidates(NOW)) {
      expect(JSON.stringify(candidate.where)).toContain(
        JSON.stringify({ NOT: { source: { in: SEARCH_SOURCES }, enrichmentStatus: { not: 'enriched' }, createdAt: { lt: '2026-10-03T15:30:00.000Z' } } })
      );
    }
  });
});

const LISTED = { source: 'confs.tech', isRelevant: true };
const SEARCH_HIT = { source: 'Linkup Search', isRelevant: true };

describe('buildVerificationUpdate', () => {
  it('follows the page of a search hit on whether a call is open, so a listed event turns into an open call', () => {
    expect(buildVerificationUpdate(SEARCH_HIT, merged({ hasOpenCall: true }), NOW).hasOpenCall).toBe(true);
    expect(buildVerificationUpdate(SEARCH_HIT, merged({ hasOpenCall: false }), NOW).hasOpenCall).toBe(false);
  });

  it('lets a page confirm a listed call but not deny it', () => {
    expect(buildVerificationUpdate(LISTED, merged({ hasOpenCall: true }), NOW).hasOpenCall).toBe(true);
    // An event home page that mentions no call: back to "not judged", which is read as open.
    expect(buildVerificationUpdate(LISTED, merged({ hasOpenCall: false }), NOW).hasOpenCall).toBeNull();
  });

  it('drops a search hit the page shows to be a directory or an article', () => {
    const update = buildVerificationUpdate(SEARCH_HIT, merged({ isRelevant: false, hasOpenCall: false }), NOW);
    expect(update).toMatchObject({ isRelevant: false, hasOpenCall: false, qualityScore: 0 });
  });

  it('brings a search hit back when a later read finds an event after all', () => {
    const update = buildVerificationUpdate({ source: 'Live Search', isRelevant: false }, merged(), NOW);
    expect(update.isRelevant).toBe(true);
    expect(update.qualityScore).toBeGreaterThan(0);
  });

  it('writes dates, location, remote, compensation, closed flag and confidence, and stamps verifiedAt', () => {
    const update = buildVerificationUpdate(LISTED, merged(), NOW);
    expect(update).toMatchObject({
      eventDate: new Date('2027-04-20T00:00:00Z'),
      cfpDeadline: new Date('2027-01-15T00:00:00Z'),
      deadlineTimezone: null,
      location: 'Denver, CO',
      isRemote: false,
      compensationType: 'travel',
      compensationAmount: 800,
      isClosed: false,
      dateConfidence: JSON.stringify({ eventDate: 'high', cfpDeadline: 'low', location: 'high' }),
      verifiedAt: NOW,
      verificationError: null,
      enrichmentClaimedAt: null,
    });
    expect(update.qualityScore).toBeGreaterThan(50);
  });

  it('writes the sectors the check found', () => {
    const update = buildVerificationUpdate(LISTED, merged({ sectors: ['healthcare', 'ai'] }), NOW);
    expect(update.sectors).toEqual(['healthcare', 'ai']);
  });

  it('does not touch title, organization or industries, nor the relevance of a listed call', () => {
    const update = buildVerificationUpdate(LISTED, merged({ isRelevant: false }), NOW);
    expect(update).not.toHaveProperty('title');
    expect(update).not.toHaveProperty('organization');
    expect(update).not.toHaveProperty('industries');
    expect(update).not.toHaveProperty('isRelevant');
    expect(update.qualityScore).toBeGreaterThan(0);
  });

  it('zeroes the quality score when the page says the call is closed', () => {
    expect(buildVerificationUpdate(LISTED, merged({ isClosed: true }), NOW).qualityScore).toBe(0);
  });
});

describe('format', () => {
  it('is stored from a page read, at enrichment and at every check', () => {
    expect(buildEnrichmentUpdate(merged({ format: 'webinar' }), { pageRead: true, now: NOW }).format).toBe('webinar');
    expect(buildVerificationUpdate(LISTED, merged({ format: 'meetup' }), NOW).format).toBe('meetup');
    expect(buildVerificationUpdate(SEARCH_HIT, merged({ format: 'podcast' }), NOW).format).toBe('podcast');
  });

  it('is left alone when enrichment only had the listing text to go by', () => {
    expect(buildEnrichmentUpdate(merged({ format: 'webinar' }), { pageRead: false, now: NOW })).not.toHaveProperty('format');
  });
});

describe('buildEnrichmentUpdate', () => {
  it('writes the cleaned fields and marks the row enriched', () => {
    const update = buildEnrichmentUpdate(merged({ title: 'KubeCon 2027', industries: ['devops', 'cloud'] }), { pageRead: true, now: NOW });
    expect(update).toMatchObject({
      title: 'KubeCon 2027',
      organization: 'Org',
      industries: JSON.stringify(['devops', 'cloud']),
      sectors: ['cloud-devops'],
      location: 'Denver, CO',
      isClosed: false,
      isRelevant: true,
      hasOpenCall: true,
      enrichmentStatus: 'enriched',
      enrichedAt: NOW,
      enrichmentError: null,
      enrichmentClaimedAt: null,
    });
  });

  it('counts as a verification only when the page itself was read', () => {
    expect(buildEnrichmentUpdate(merged(), { pageRead: true, now: NOW })).toMatchObject({ verifiedAt: NOW, verificationError: null });
    const fromDescription = buildEnrichmentUpdate(merged(), { pageRead: false, now: NOW });
    expect(fromDescription).not.toHaveProperty('verifiedAt');
    expect(fromDescription).not.toHaveProperty('verificationError');
  });

  it('keeps a listed call open when its page mentions none, and takes a search hit at its word', () => {
    expect(buildEnrichmentUpdate(merged({ hasOpenCall: false }), { pageRead: true, now: NOW }).hasOpenCall).toBeNull();
    expect(buildEnrichmentUpdate(merged({ source: 'Live Search', hasOpenCall: false }), { pageRead: true, now: NOW }).hasOpenCall).toBe(false);
  });

  it('hides a row the page shows not to be an event, whatever its source', () => {
    const update = buildEnrichmentUpdate(merged({ isRelevant: false, hasOpenCall: false }), { pageRead: true, now: NOW });
    expect(update).toMatchObject({ isRelevant: false, hasOpenCall: false, qualityScore: 0 });
  });
});

describe('failure updates', () => {
  it('closes a listing whose page is gone and records the reason', () => {
    expect(buildGoneUpdate('HTTP 404', NOW)).toEqual({
      isClosed: true,
      qualityScore: 0,
      verifiedAt: NOW,
      verificationError: 'Page unavailable: HTTP 404',
      enrichmentClaimedAt: null,
    });
  });

  it('records a check that could not complete without changing the listing', () => {
    expect(buildVerificationErrorUpdate('Timed out after 8000ms', NOW)).toEqual({
      verifiedAt: NOW,
      verificationError: 'Timed out after 8000ms',
      enrichmentClaimedAt: null,
    });
  });
});
