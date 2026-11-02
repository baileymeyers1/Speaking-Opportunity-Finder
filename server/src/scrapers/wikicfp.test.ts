import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseWikiCfpDeadline, parseWikiCfpFeed } from './wikicfp.js';

const feedXml = readFileSync(join(__dirname, '__fixtures__', 'wikicfp-computer-science.xml'), 'utf8');
const detailHtml = readFileSync(join(__dirname, '__fixtures__', 'wikicfp-event-203800.html'), 'utf8');
const now = new Date('2026-11-02T12:00:00Z');

describe('parseWikiCfpFeed', () => {
  const results = parseWikiCfpFeed(feedXml, ['technology', 'computer science'], now);

  it('keeps upcoming events and drops journals, chapters and past events', () => {
    // Fixture: 18 items; 4 journals/special sections, 1 book-chapter call,
    // 1 event that ended in June 2026.
    expect(results).toHaveLength(12);
    for (const result of results) {
      expect(result.title).not.toMatch(/journal|chapters/i);
    }
    expect(results.some((result) => result.location === 'Venice, Italy')).toBe(false);
  });

  it('decodes &amp; in links and keeps them distinct and absolute', () => {
    const urls = results.map((result) => result.applyUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(url).toMatch(/^http:\/\/www\.wikicfp\.com\/cfp\/servlet\/event\.showcfp\?eventid=\d+&copyownerid=\d+$/);
    }
  });

  it('reads location and event dates from the description brackets', () => {
    const citce = results.find((result) => result.title.startsWith('CITCE 2026'));
    expect(citce?.location).toBe('Suzhou, China');
    expect(citce?.eventDate?.toISOString()).toBe('2026-12-11T00:00:00.000Z');
    expect(citce?.isRemote).toBe(false);
    expect(citce?.organization).toBe(
      'IEEE 2026 6th International Conference on Computer, Internet of Things and Control Engineering',
    );
    expect(citce?.cfpDeadline).toBeUndefined();
  });

  it('treats "[Full online]" as remote and "[N/A]" as no location', () => {
    const online = results.find((result) => result.title.startsWith('BDAMI 2026'));
    expect(online?.isRemote).toBe(true);
    expect(online?.location).toBeNull();
    for (const result of results) expect(result.location).not.toBe('N/A');
  });
});

describe('parseWikiCfpDeadline', () => {
  it('reads the Submission Deadline from the detail page', () => {
    expect(parseWikiCfpDeadline(detailHtml)?.toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });

  it('returns undefined when the page has no deadline', () => {
    expect(parseWikiCfpDeadline('<html><body>No dates</body></html>')).toBeUndefined();
  });
});
