import { describe, it, expect, vi } from 'vitest';
import { followCallPage, shouldFollowCall, type FollowDeps, type PageExtraction } from './callFollowing.js';
import { mergeExtraction, type ExtractionResult } from './extraction.js';
import type { ScraperResult } from '../scrapers/qualityScore.js';

const NOW = new Date('2026-11-24T12:00:00Z');
const EVENT_PAGE = 'https://greenpowerforum.example/2027';
const CALL_PAGE = 'https://greenpowerforum.example/2027/call-for-speakers';

function extraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    eventDate: new Date('2027-03-03T00:00:00Z'),
    cfpDeadline: null,
    deadlineTimezone: null,
    location: 'Denver, CO',
    isRemote: false,
    isClosed: false,
    isRelevant: true,
    hasOpenCall: false,
    compensationType: null,
    compensationAmount: null,
    format: 'conference',
    industries: ['energy'],
    sectors: ['energy'],
    cleanTitle: 'Green Power Forum 2027',
    cleanOrganization: 'Green Power Association',
    confidence: { eventDate: 'high', cfpDeadline: 'high', location: 'high' },
    payToPresent: null,
    callPageUrl: CALL_PAGE,
    officialUrl: null,
    listedEvents: [],
    ...overrides,
  };
}

const row: ScraperResult = {
  title: 'Green Power Forum',
  organization: 'Green Power Association',
  isRemote: false,
  format: 'conference',
  industries: [],
  applyUrl: EVENT_PAGE,
  source: 'Linkup Search',
};

function firstRead(overrides: Partial<ExtractionResult> = {}): PageExtraction {
  const result = extraction(overrides);
  return { merged: mergeExtraction(row, result, NOW), extraction: result };
}

function deps(callPage: Partial<ExtractionResult> | 'unreadable' | 'failed', reserved = true): FollowDeps & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    now: NOW,
    readPage: vi.fn(async (url: string) => {
      reads.push(url);
      return callPage === 'unreadable'
        ? { ok: false as const, reason: 'http_error' as const, status: 403, message: 'HTTP 403' }
        : { ok: true as const, status: 200, text: 'Call for speakers: submit by January 15, 2027.', links: [] };
    }),
    extract: vi.fn(async () =>
      callPage === 'failed' || callPage === 'unreadable'
        ? { status: 'failed' as const, error: 'model error' }
        : { status: 'ok' as const, result: extraction({ hasOpenCall: true, callPageUrl: null, ...callPage }) }
    ),
    reserveCall: vi.fn(async () => reserved),
    releaseCall: vi.fn(async () => {}),
  };
}

describe('followCallPage', () => {
  it('reads the call page an event page links to, and applies there when the call is open', async () => {
    const follow = deps({ cfpDeadline: new Date('2027-01-15T23:59:59Z'), payToPresent: false });
    const result = await followCallPage(firstRead(), follow);
    expect(follow.reads).toEqual([CALL_PAGE]);
    expect(result.hasOpenCall).toBe(true);
    expect(result.callUrl).toBe(CALL_PAGE);
    expect(result.applyUrl).toBe(EVENT_PAGE);
    expect(result.cfpDeadline?.toISOString()).toBe('2027-01-15T23:59:59.000Z');
    expect(result.payToPresent).toBe(false);
    // What the event page said and the call page did not stays.
    expect(result.location).toBe('Denver, CO');
  });

  it('keeps the first read when the call page holds no open call, or a closed one', async () => {
    for (const callPage of [{ hasOpenCall: false }, { isClosed: true }, { isRelevant: false }]) {
      const result = await followCallPage(firstRead(), deps(callPage));
      expect(result.hasOpenCall).toBe(false);
      expect(result.callUrl).toBeNull();
      expect(result.isClosed).toBe(false);
    }
  });

  it('keeps the first read when the call page cannot be read, without spending a call', async () => {
    const follow = deps('unreadable');
    const result = await followCallPage(firstRead(), follow);
    expect(result.callUrl).toBeNull();
    expect(follow.reserveCall).not.toHaveBeenCalled();
  });

  it('keeps the first read when the budget is spent or the extraction fails', async () => {
    expect((await followCallPage(firstRead(), deps({}, false))).callUrl).toBeNull();
    expect((await followCallPage(firstRead(), deps('failed'))).callUrl).toBeNull();
  });

  it('applies on the named call page without reading it when the event page already says the call is open', async () => {
    const follow = deps({});
    const result = await followCallPage(firstRead({ hasOpenCall: true }), follow);
    expect(follow.reads).toEqual([]);
    expect(result.callUrl).toBe(CALL_PAGE);
    expect(result.hasOpenCall).toBe(true);
  });

  it('follows nothing when the page holds the call, names no call page, is closed or is not an event', async () => {
    for (const overrides of [{ hasOpenCall: true, callPageUrl: null }, { callPageUrl: null }, { isClosed: true }, { isRelevant: false }]) {
      const first = firstRead(overrides);
      expect(shouldFollowCall(first)).toBe(false);
      const follow = deps({});
      await followCallPage(first, follow);
      expect(follow.reads).toEqual([]);
    }
  });
});
