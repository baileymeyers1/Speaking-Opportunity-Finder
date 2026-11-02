import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildConferenceAlertsResults,
  parseConferenceAlertsDetail,
  parseConferenceAlertsListing,
} from './conferenceAlerts.js';

const fixturesDir = join(__dirname, '__fixtures__');
const listingHtml = readFileSync(join(fixturesDir, 'conferencealerts-listing.html'), 'utf8');
const detailHtmlById = new Map(
  readdirSync(fixturesDir)
    .map((file) => file.match(/^conferencealerts-event-(\d+)\.html$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => [match[1], readFileSync(join(fixturesDir, match[0]), 'utf8')] as const),
);
const now = new Date('2026-11-02T12:00:00Z');

describe('parseConferenceAlertsListing', () => {
  const listings = parseConferenceAlertsListing(listingHtml, now);

  it('parses every upcoming row, skipping past months and banner links', () => {
    // Fixture has 32 rows: 1 in June 2025 and 1 in October 2026 are past.
    expect(listings).toHaveLength(30);
    expect(listings.some((listing) => listing.eventId === '0')).toBe(false);
    expect(listings.some((listing) => listing.eventId === '269848')).toBe(false);
  });

  it('builds the event date from the month header and the day cell', () => {
    const first = listings[0];
    expect(first.title).toBe('Second International Conferene on Innovations in Pharma R&D');
    expect(first.eventDate.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(first.location).toBe('Boston, United States');
    expect(first.detailUrl).toBe('https://conferencealerts.com/show-event?id=275002');

    const featured = listings.find((listing) => listing.eventId === '271712');
    expect(featured?.eventDate.toISOString()).toBe('2026-12-10T00:00:00.000Z');
  });

  it('gives every row its own absolute detail URL', () => {
    const urls = listings.map((listing) => listing.detailUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url).toMatch(/^https:\/\/conferencealerts\.com\/show-event\?id=\d+$/);
  });

  it('reads the online badge', () => {
    expect(listings.find((listing) => listing.eventId === '275030')?.isRemote).toBe(true);
    expect(listings.find((listing) => listing.eventId === '279959')?.isRemote).toBe(false);
  });
});

describe('parseConferenceAlertsDetail', () => {
  it('extracts deadline, website, organiser and description', () => {
    const detail = parseConferenceAlertsDetail(detailHtmlById.get('271712')!);
    expect(detail.title).toBe('2026 Fall Public Policy Conference');
    expect(detail.cfpDeadline?.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(detail.website).toBe('https://uofriverside.com/2026-fall-public-policy-conference/');
    expect(detail.organiser).toBe('University of Riverside');
    expect(detail.location).toBe('Los Angeles, California, United States');
    expect(detail.description).toMatch(/^This symposium is designed/);
  });

  it('returns no deadline when the page has none', () => {
    expect(parseConferenceAlertsDetail(detailHtmlById.get('275030')!).cfpDeadline).toBeUndefined();
  });
});

describe('buildConferenceAlertsResults', () => {
  const listings = parseConferenceAlertsListing(listingHtml, now);
  const results = buildConferenceAlertsResults(listings, detailHtmlById, now);

  it('keeps only events with an open abstract deadline', () => {
    // 8 detail fixtures: 5 open deadlines, 1 past (279959), 2 without a deadline.
    expect(results.map((result) => result.sourceUrl).sort()).toEqual(
      ['271712', '278879', '279942', '280378', '281635'].map(
        (id) => `https://conferencealerts.com/show-event?id=${id}`,
      ),
    );
    for (const result of results) {
      expect(result.cfpDeadline).toBeInstanceOf(Date);
      expect(result.cfpDeadline!.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 10, 2));
      expect(result.eventDate).toBeInstanceOf(Date);
    }
  });

  it('uses each event website as a distinct absolute applyUrl', () => {
    const urls = results.map((result) => result.applyUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(() => new URL(url)).not.toThrow();
    expect(urls).not.toContain('https://conferencealerts.com/country-listing.php?country=United+States+of+America&ipp=All&page=1');
  });

  it('does not fabricate title suffixes or placeholder descriptions', () => {
    for (const result of results) {
      expect(result.title).not.toMatch(/call for (speakers|papers)/i);
      expect(result.description ?? '').not.toMatch(/listed on conferencealerts/i);
    }
  });

  it('falls back to the detail page when events share a website', () => {
    const shared = new Map([
      ['271712', detailHtmlById.get('271712')!],
      ['281635', detailHtmlById.get('271712')!],
    ]);
    const urls = buildConferenceAlertsResults(listings, shared, now).map((result) => result.applyUrl);
    expect(urls).toEqual([
      'https://conferencealerts.com/show-event?id=271712',
      'https://conferencealerts.com/show-event?id=281635',
    ]);
  });
});
