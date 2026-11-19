import { describe, it, expect } from 'vitest';
import { isSearchSource, isUnreadSearchHit, openCallAfterRead, type ReadState } from './searchSources.js';

const READ_AT = new Date('2026-11-10T09:00:00Z');

function row(overrides: Partial<ReadState> = {}): ReadState {
  return { source: 'Linkup Search', enrichmentStatus: 'enriched', verifiedAt: READ_AT, verificationError: null, ...overrides };
}

describe('isSearchSource', () => {
  it('names the two web-search sources and nothing else', () => {
    expect(isSearchSource('Live Search')).toBe(true);
    expect(isSearchSource('Linkup Search')).toBe(true);
    expect(isSearchSource('sessionize.com')).toBe(false);
    expect(isSearchSource('wikicfp.com')).toBe(false);
  });
});

describe('isUnreadSearchHit', () => {
  it('is false once the page has been read and the last check went through', () => {
    expect(isUnreadSearchHit(row())).toBe(false);
    expect(isUnreadSearchHit(row({ source: 'Live Search' }))).toBe(false);
  });

  it.each([
    ['not enriched yet', { enrichmentStatus: null, verifiedAt: null }],
    ['skipped because its page was unreadable', { enrichmentStatus: 'skipped', verifiedAt: null }],
    ['enriched from the snippet, page never read', { verifiedAt: null }],
    ['read once, last check failed', { verificationError: 'HTTP 403' }],
  ])('is true for a hit %s', (_label, overrides) => {
    expect(isUnreadSearchHit(row(overrides))).toBe(true);
  });

  it('never applies to a row from a CFP listing', () => {
    expect(isUnreadSearchHit(row({ source: 'confs.tech', enrichmentStatus: null, verifiedAt: null }))).toBe(false);
    expect(isUnreadSearchHit(row({ source: 'pretalx.com', verificationError: 'HTTP 403' }))).toBe(false);
  });
});

describe('openCallAfterRead', () => {
  it('takes the page at its word for a search hit', () => {
    expect(openCallAfterRead('Linkup Search', { isRelevant: true, hasOpenCall: true })).toBe(true);
    expect(openCallAfterRead('Linkup Search', { isRelevant: true, hasOpenCall: false })).toBe(false);
  });

  it('lets a page confirm a listed call but not deny it', () => {
    expect(openCallAfterRead('developers.events', { isRelevant: true, hasOpenCall: true })).toBe(true);
    expect(openCallAfterRead('developers.events', { isRelevant: true, hasOpenCall: false })).toBeNull();
  });

  it('is false for anything that is not an event', () => {
    expect(openCallAfterRead('developers.events', { isRelevant: false, hasOpenCall: true })).toBe(false);
    expect(openCallAfterRead('Live Search', { isRelevant: false, hasOpenCall: true })).toBe(false);
  });
});
