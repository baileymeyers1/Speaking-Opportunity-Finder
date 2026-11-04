import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseDevelopersEvents } from './developersEvents.js';

const events: unknown = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'developers-events-all-events.json'), 'utf8'),
);
const now = new Date('2026-11-02T12:00:00Z');

describe('parseDevelopersEvents', () => {
  const results = parseDevelopersEvents(events, now);

  it('keeps only open CFPs, one per CFP link', () => {
    // Fixture: 12 open CFPs (two HalfStack events share one CFP form),
    // 3 closed CFPs, 3 events without a CFP, 1 CFP marked "Closed" without a date.
    expect(results).toHaveLength(11);
    expect(results.map((result) => result.title)).not.toContain('HalfStack Phoenix');
    expect(results.map((result) => result.title)).toContain('HalfStack Vienna');
  });

  it('uses the cfp.link as a distinct absolute applyUrl', () => {
    const urls = results.map((result) => result.applyUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url).toMatch(/^https?:\/\//);
  });

  it('maps hyperlink, date[] epoch ms and cfp.untilDate', () => {
    const ffconf = results.find((result) => result.title === 'ffconf');
    expect(ffconf).toBeDefined();
    // untilDate names Nov 13 with no zone: the call stays open until that day ends Anywhere on Earth.
    expect(ffconf!.cfpDeadline?.toISOString()).toBe('2026-11-14T11:59:59.000Z');
    expect(ffconf!.deadlineTimezone).toBeUndefined();
    expect(ffconf!.eventDate).toBeInstanceOf(Date);
    expect(ffconf!.location).toBe('Brighton (UK)');
    expect(ffconf!.sourceUrl).toMatch(/^https?:\/\//);
    for (const result of results) {
      expect(result.cfpDeadline!.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 10, 2));
    }
  });

  it('flags online events and uses tags as industries', () => {
    const aria = results.find((result) => result.title === 'ARIA Community');
    expect(aria?.isRemote).toBe(true);
    expect(aria?.location).toBeNull();
    const voice = results.find((result) => result.title === 'Voice Agents Forum');
    expect(voice?.isRemote).toBe(true);
    for (const result of results) {
      expect(result.industries.length).toBeGreaterThan(0);
      expect(result.industries).not.toContain('english');
    }
  });

  it('does not fabricate title suffixes', () => {
    for (const result of results) expect(result.title).not.toMatch(/call for speakers/i);
  });

  it('returns [] for non-array input', () => {
    expect(parseDevelopersEvents({ conf: {} }, now)).toEqual([]);
  });
});
