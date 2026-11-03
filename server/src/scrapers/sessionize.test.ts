import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildSessionizeResults,
  inferSessionizeFormat,
  parseSessionizeEventPage,
  parseSessionizeSitemap,
} from './sessionize.js';

const fixturesDir = join(__dirname, '__fixtures__');
const sitemapXml = readFileSync(join(fixturesDir, 'sessionize-events-sitemap.xml'), 'utf8');
const pageHtml = (slug: string) => readFileSync(join(fixturesDir, `sessionize-event-${slug}.html`), 'utf8');
const pageUrl = (slug: string) => `https://sessionize.com/${slug}/`;
const now = new Date('2026-11-03T12:00:00Z');

const SLUGS = ['net-conf-2026-my-agents-latam-lima', 'jax-data-monthly-meetings-2027', 'cincydata', 'devworld-conference-2025'];
const pagesByUrl = new Map(SLUGS.map((slug) => [pageUrl(slug), pageHtml(slug)]));

describe('parseSessionizeSitemap', () => {
  it('returns event page URLs in sitemap order', () => {
    const urls = parseSessionizeSitemap(sitemapXml);
    expect(urls).toHaveLength(12);
    expect(urls[0]).toBe('https://sessionize.com/cincydata/');
    for (const url of urls) expect(url).toMatch(/^https:\/\/sessionize\.com\/[^/]+\/$/);
  });
});

describe('parseSessionizeEventPage', () => {
  it('reads an open single-date conference', () => {
    const page = parseSessionizeEventPage(pageHtml('net-conf-2026-my-agents-latam-lima'));
    expect(page.title).toBe('.NET Conf 2026 - My Agents LATAM / Lima');
    expect(page.isClosed).toBe(false);
    expect(page.opensAt?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(page.closesAt?.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(page.eventDate?.toISOString()).toBe('2026-12-05T00:00:00.000Z');
    expect(page.plannedDates).toEqual([]);
    expect(page.location).toBe('Lima, Peru');
    expect(page.isRemote).toBe(false);
    expect(page.website).toBe('https://www.meetup.com/my-agents-latam/events/317253972/');
    expect(page.description).toMatch(/^\.NET 11 ya está aquí/);
    expect(page.description).toMatch(/Temas que buscamos/);
  });

  it('reads a recurring user group with a venue', () => {
    const page = parseSessionizeEventPage(pageHtml('jax-data-monthly-meetings-2027'));
    expect(page.title).toBe('Jax Data - Monthly Meetings 2027');
    expect(page.eventDate).toBeUndefined();
    expect(page.plannedDates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      '2027-01-20', '2027-02-17', '2027-03-17', '2027-04-21', '2027-06-16',
      '2027-07-21', '2027-08-18', '2027-09-15', '2027-10-20',
    ]);
    expect(page.location).toBe('Keiser University, Jacksonville, Florida, United States');
    expect(page.closesAt?.toISOString()).toBe('2027-10-20T00:00:00.000Z');
    expect(page.description).toMatch(/Dinner provided/);
  });

  it('treats an online group as remote without a location', () => {
    const page = parseSessionizeEventPage(pageHtml('cincydata'));
    expect(page.location).toBeUndefined();
    expect(page.isRemote).toBe(true);
    expect(page.plannedDates[0]?.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(page.closesAt?.toISOString()).toBe('2027-10-31T00:00:00.000Z');
  });

  it('marks a closed call', () => {
    const page = parseSessionizeEventPage(pageHtml('devworld-conference-2025'));
    expect(page.isClosed).toBe(true);
    expect(page.title).toBe('Devworld Conference 2025');
    expect(page.eventDate?.toISOString()).toBe('2025-02-27T00:00:00.000Z');
  });
});

describe('inferSessionizeFormat', () => {
  it('labels recurring groups as meetups and events as conferences', () => {
    expect(inferSessionizeFormat(parseSessionizeEventPage(pageHtml('jax-data-monthly-meetings-2027')))).toBe('meetup');
    expect(inferSessionizeFormat(parseSessionizeEventPage(pageHtml('cincydata')))).toBe('meetup');
    expect(inferSessionizeFormat(parseSessionizeEventPage(pageHtml('net-conf-2026-my-agents-latam-lima')))).toBe('conference');
  });
});

describe('buildSessionizeResults', () => {
  const results = buildSessionizeResults(pagesByUrl, now);

  it('keeps only open calls, one per event page', () => {
    expect(results.map((result) => result.title).sort()).toEqual([
      '.NET Conf 2026 - My Agents LATAM / Lima',
      'CincyData',
      'Jax Data - Monthly Meetings 2027',
    ]);
    expect(new Set(results.map((result) => result.applyUrl)).size).toBe(3);
  });

  it('maps the page URL as applyUrl and the website as sourceUrl', () => {
    const netConf = results.find((result) => result.title.startsWith('.NET Conf'))!;
    expect(netConf.applyUrl).toBe(pageUrl('net-conf-2026-my-agents-latam-lima'));
    expect(netConf.sourceUrl).toBe('https://www.meetup.com/my-agents-latam/events/317253972/');
    expect(netConf.cfpDeadline?.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(netConf.eventDate?.toISOString()).toBe('2026-12-05T00:00:00.000Z');
    expect(netConf.source).toBe('sessionize.com');
    expect(netConf.format).toBe('conference');
  });

  it('uses the next planned date as the event date of a recurring group', () => {
    const jax = results.find((result) => result.title.startsWith('Jax Data'))!;
    expect(jax.eventDate?.toISOString()).toBe('2027-01-20T00:00:00.000Z');
    expect(jax.format).toBe('meetup');
    expect(jax.location).toBe('Keiser University, Jacksonville, Florida, United States');

    const cincy = results.find((result) => result.title === 'CincyData')!;
    expect(cincy.isRemote).toBe(true);
    expect(cincy.location).toBeNull();
  });

  it('drops calls whose close date has passed', () => {
    const later = buildSessionizeResults(pagesByUrl, new Date('2026-11-20T12:00:00Z'));
    expect(later.map((result) => result.title)).not.toContain('.NET Conf 2026 - My Agents LATAM / Lima');
    expect(later).toHaveLength(2);
  });
});
