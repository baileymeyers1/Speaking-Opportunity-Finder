import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { pageUrl, pagesForRun, parseTradeShowPage } from './tradeShowCalendar.js';
import { toScraperResult, worthReading } from './common.js';

const html = readFileSync(fileURLToPath(new URL('../__fixtures__/tradeshowcalendar-us-page.html', import.meta.url)), 'utf8');

describe('parseTradeShowPage', () => {
  const events = parseTradeShowPage(html);

  it('reads every row of a page', () => {
    expect(events).toHaveLength(30);
  });

  it("takes the show's name, its own site, the first day and the city", () => {
    expect(events[0]).toEqual({
      name: 'The Los Angeles Auto Show - LA Auto Show',
      url: 'https://www.laautoshow.com/',
      startDate: new Date('2026-11-20T00:00:00Z'),
      location: 'Los Angeles, CA',
    });
    expect(events[1]).toMatchObject({ name: 'Greater New York Dental Meeting - GNYDM', url: 'https://www.gnydm.com/', location: 'New York, NY' });
  });

  it('gives every row an address and a date', () => {
    expect(events.every((event) => /^https?:\/\//.test(event.url) && event.startDate)).toBe(true);
  });
});

describe('the rotating window', () => {
  it('reads four pages a run, moving on each day and wrapping round', () => {
    const day = (n: number) => new Date(n * 86_400_000 + 6 * 3_600_000);
    expect(pagesForRun(day(0))).toEqual([0, 1, 2, 3]);
    expect(pagesForRun(day(1))).toEqual([4, 5, 6, 7]);
    expect(pagesForRun(day(14))).toEqual([56, 57, 58, 59]);
    expect(pagesForRun(day(15))).toEqual([0, 1, 2, 3]);
  });

  it('asks the US list 30 rows at a time', () => {
    expect(pageUrl(2)).toBe('https://www.thetradeshowcalendar.com/tsnn/index.php?vShow=search&vCtry=United+States&vRpP=30&vPos=60');
  });
});

describe('which events are worth a row', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000);

  it('skips an event too close to apply to, or too far off to have a call yet', () => {
    expect(worthReading({ name: 'x', url: 'https://x.example', startDate: at(5) }, now)).toBe(false);
    expect(worthReading({ name: 'x', url: 'https://x.example', startDate: at(45) }, now)).toBe(true);
    expect(worthReading({ name: 'x', url: 'https://x.example', startDate: at(400) }, now)).toBe(true);
    expect(worthReading({ name: 'x', url: 'https://x.example', startDate: at(700) }, now)).toBe(false);
  });

  it('keeps a call whose deadline has not passed, however soon', () => {
    expect(worthReading({ name: 'x', url: 'https://x.example', deadline: at(2) }, now)).toBe(true);
    expect(worthReading({ name: 'x', url: 'https://x.example', deadline: at(-3) }, now)).toBe(false);
  });

  it("stores an event as a link to its own site, credited to the calendar", () => {
    const result = toScraperResult(
      { name: 'Construction SuperConference - CSC', url: 'https://constructionsuperconference.com/', startDate: at(60), location: 'Huntington Beach, CA' },
      { source: 'thetradeshowcalendar.com', name: 'The Trade Show Calendar', listingUrl: 'https://www.thetradeshowcalendar.com/tsnn/' }
    );
    expect(result).toMatchObject({
      title: 'Construction SuperConference - CSC',
      organization: 'constructionsuperconference.com',
      applyUrl: 'https://constructionsuperconference.com/',
      source: 'thetradeshowcalendar.com',
      sourceUrl: 'https://www.thetradeshowcalendar.com/tsnn/',
      location: 'Huntington Beach, CA',
      format: 'other',
      description: 'Listed on The Trade Show Calendar',
    });
    expect(result.cfpDeadline).toBeUndefined();
  });
});
