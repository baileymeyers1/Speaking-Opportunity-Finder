import { describe, it, expect } from 'vitest';
import { mergeClaudeMetadata } from './liveSearchService.js';
import type { EnrichedLiveResult } from './liveSearchService.js';

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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isLiveResult: true,
    liveSearchUrl: 'https://example.com',
    ...overrides,
  };
}

describe('mergeClaudeMetadata', () => {
  it('overwrites regex location with Claude location', () => {
    const result = makeResult({ location: 'Los Angeles' });
    const claudeMeta = { location: 'Boston, MA' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.location).toBe('Boston, MA');
  });

  it('overwrites null eventDate with Claude eventDate', () => {
    const result = makeResult({ eventDate: null });
    const claudeMeta = { eventDate: '2026-09-15' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.eventDate).toBe('2026-09-15T00:00:00.000Z');
  });

  it('overwrites existing eventDate with Claude eventDate', () => {
    const result = makeResult({ eventDate: '2026-01-01T00:00:00.000Z' });
    const claudeMeta = { eventDate: '2026-09-15' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.eventDate).toBe('2026-09-15T00:00:00.000Z');
  });

  it('overwrites existing cfpDeadline with Claude cfpDeadline', () => {
    const result = makeResult({ cfpDeadline: '2026-01-01T00:00:00.000Z' });
    const claudeMeta = { cfpDeadline: '2026-06-01' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.cfpDeadline).toBe('2026-06-01T00:00:00.000Z');
  });

  it('does not clear fields when Claude returns undefined', () => {
    const result = makeResult({ location: 'Chicago, IL', eventDate: '2026-05-01T00:00:00.000Z' });
    const claudeMeta = {};
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.location).toBe('Chicago, IL');
    expect(result.eventDate).toBe('2026-05-01T00:00:00.000Z');
  });

  it('sets isClosed deadline marker', () => {
    const result = makeResult({ cfpDeadline: null });
    const claudeMeta = { isClosed: true };
    mergeClaudeMetadata(result, claudeMeta);
    expect(new Date(result.cfpDeadline!).getUTCFullYear()).toBe(2020);
  });

  it('overwrites format only when Claude provides one', () => {
    const result = makeResult({ format: 'conference' });
    const claudeMeta = { format: 'workshop' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.format).toBe('workshop');
  });

  it('keeps existing format when Claude returns undefined', () => {
    const result = makeResult({ format: 'podcast' });
    const claudeMeta = {};
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.format).toBe('podcast');
  });

  it('overwrites isRemote', () => {
    const result = makeResult({ isRemote: false });
    const claudeMeta = { isRemote: true };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.isRemote).toBe(true);
  });

  it('rejects invalid date strings from Claude', () => {
    const result = makeResult({ eventDate: null });
    const claudeMeta = { eventDate: 'not-a-date' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.eventDate).toBeNull();
  });
});
