import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { EVENTS_CALENDAR_SITES, parseEventsCalendar } from './eventsCalendar.js';
import { toScraperResult, worthReading } from './common.js';

const body = JSON.parse(readFileSync(fileURLToPath(new URL('../__fixtures__/wdo-events.json', import.meta.url)), 'utf8'));
const NOW = new Date('2026-11-24T12:00:00Z');

describe('parseEventsCalendar', () => {
  const events = parseEventsCalendar(body);
  const named = (start: string) => events.find((event) => event.name.startsWith(start));

  it('reads every event the API returns', () => {
    expect(events).toHaveLength(19);
  });

  it("links an event to its own site, with its first day and its country", () => {
    expect(named('DESIGN KOREA')).toMatchObject({
      url: 'https://designkorea.kidp.or.kr/',
      startDate: new Date('2026-11-25T00:00:00Z'),
      location: 'Korea, Republic of',
      isRemote: false,
    });
  });

  it("uses the calendar's page when the event's link is a form, a meeting or missing", () => {
    expect(named('Designing Experiences through Glass')?.url).toBe('https://wdo.org/event/designing-experiences-through-glass/');
    expect(named('ASK THE BOARD')?.url).toMatch(/^https:\/\/wdo\.org\/event\//);
    expect(named('Designing innovation ecosystems')?.url).toMatch(/^https:\/\/wdo\.org\/event\//);
    expect(named('2027 Urban Creative City-break')?.url).toBe('https://wdo.org/event/2027-urban-creative-city-break/');
  });

  it('reads a venue named Online as an online event', () => {
    expect(named('Designing Experiences through Glass')).toMatchObject({ isRemote: true, location: null });
  });

  it('decodes the titles', () => {
    expect(named('Maison')?.name).toBe('Maison & Objet Premier');
    expect(named('“Weave a Lamp Shade” Craft W')).toBeTruthy();
  });

  it('keeps the events a month to eighteen months out', () => {
    const kept = events.filter((event) => worthReading(event, NOW)).map((event) => event.name);
    expect(kept).toHaveLength(11);
    expect(kept[0]).toBe('Maison & Objet Premier');
    expect(kept).toContain('World Design Congress Seoul 2027');
  });

  it('answers nothing for a body that is not the API', () => {
    expect(parseEventsCalendar(null)).toEqual([]);
    expect(parseEventsCalendar({ code: 'rest_no_route' })).toEqual([]);
  });
});

describe('a WDO event as a row', () => {
  it('is credited to WDO and points at the event', () => {
    const site = EVENTS_CALENDAR_SITES.find((entry) => entry.origin === 'https://wdo.org');
    const event = parseEventsCalendar(body).find((entry) => entry.name === 'Salone del Mobile 2027');
    expect(site && event).toBeTruthy();
    expect(toScraperResult(event!, site!)).toMatchObject({
      title: 'Salone del Mobile 2027',
      organization: 'salonemilano.it',
      applyUrl: 'https://www.salonemilano.it/en',
      source: 'wdo.org',
      sourceUrl: 'https://wdo.org/events/',
      location: 'Italy',
      description: 'Listed on World Design Organization',
    });
  });
});
