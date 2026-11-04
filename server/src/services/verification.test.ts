import { describe, it, expect } from 'vitest';
import {
  buildGoneUpdate,
  buildVerificationErrorUpdate,
  buildVerificationUpdate,
  verificationCandidates,
  verificationWindows,
} from './verification.js';
import type { MergedOpportunity } from './extraction.js';

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
    compensationType: 'travel',
    compensationAmount: 800,
    applyUrl: 'https://example.test/cfp',
    source: 'confs.tech',
    isClosed: false,
    isRelevant: true,
    dateConfidence: { eventDate: 'high', cfpDeadline: 'low', location: 'high' },
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
});

describe('buildVerificationUpdate', () => {
  it('writes dates, location, remote, compensation, closed flag and confidence, and stamps verifiedAt', () => {
    const update = buildVerificationUpdate({ isRelevant: true }, merged(), NOW);
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

  it('does not touch title, organization, industries or relevance', () => {
    const update = buildVerificationUpdate({ isRelevant: true }, merged({ isRelevant: false }), NOW);
    expect(update).not.toHaveProperty('title');
    expect(update).not.toHaveProperty('organization');
    expect(update).not.toHaveProperty('industries');
    expect(update).not.toHaveProperty('isRelevant');
  });

  it('zeroes the quality score when the page says the call is closed', () => {
    expect(buildVerificationUpdate({ isRelevant: true }, merged({ isClosed: true }), NOW).qualityScore).toBe(0);
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
