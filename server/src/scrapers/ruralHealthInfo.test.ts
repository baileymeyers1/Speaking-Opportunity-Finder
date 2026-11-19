import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildRuralHealthResults,
  hasNextRuralHealthPage,
  parseEventDateRange,
  parseRuralHealthCallsPage,
  type RuralHealthEvent,
} from './ruralHealthInfo.js';

// Pages saved from ruralhealthinfo.org/events/calls on 2026-11-18; contact
// e-mail addresses and phone numbers were replaced with placeholders.
const fixturesDir = join(__dirname, '__fixtures__');
const page = (name: string) => readFileSync(join(fixturesDir, `ruralhealthinfo-calls-${name}.html`), 'utf8');
const pageOne = page('page-1');
const pageTwo = page('page-2');
const emptyPage = page('empty');
const now = new Date('2026-11-18T18:00:00Z');

const isoDay = (date: Date | undefined) => date?.toISOString().slice(0, 10);

describe('parseEventDateRange', () => {
  it('reads a single day', () => {
    const range = parseEventDateRange('Apr 15, 2027');
    expect(isoDay(range.start)).toBe('2027-04-15');
    expect(isoDay(range.end)).toBe('2027-04-15');
  });

  it('reads a range inside one month', () => {
    const range = parseEventDateRange('Apr 14 - 16, 2027');
    expect(isoDay(range.start)).toBe('2027-04-14');
    expect(isoDay(range.end)).toBe('2027-04-16');
  });

  it('reads a range across two months', () => {
    const range = parseEventDateRange('Apr 30 - May 1, 2027');
    expect(isoDay(range.start)).toBe('2027-04-30');
    expect(isoDay(range.end)).toBe('2027-05-01');
  });

  it('puts a December start before a January end in the year before', () => {
    expect(isoDay(parseEventDateRange('Dec 30 - Jan 2, 2027').start)).toBe('2026-12-30');
    expect(isoDay(parseEventDateRange('Dec 30, 2026 - Jan 2, 2027').start)).toBe('2026-12-30');
  });

  it('returns nothing for text that is not a date', () => {
    expect(parseEventDateRange('The Inverness Denver')).toEqual({});
    expect(parseEventDateRange('Feb 31, 2027').start).toBeUndefined();
  });
});

describe('parseRuralHealthCallsPage', () => {
  const events = parseRuralHealthCallsPage(pageOne);

  it('reads every event on the page', () => {
    expect(events).toHaveLength(10);
    for (const event of events) {
      expect(event.eventUrl).toMatch(/^https:\/\//);
      expect(event.organization).toBeTruthy();
      expect(event.eventStart).toBeInstanceOf(Date);
      expect(event.location).toMatch(/^[A-Z][A-Za-z .]+, [A-Z]{2}$/);
      expect(event.calls).toHaveLength(1);
      expect(event.calls[0].deadline).toBeInstanceOf(Date);
    }
  });

  it('reads the event, its organizer, venue, city and call', () => {
    expect(events[0]).toEqual<RuralHealthEvent>({
      title: '2027 Colorado Rural Healthcare Conference',
      eventUrl: 'https://coruralhealth.org/the-colorado-rural-healthcare-conference',
      organization: 'Colorado Rural Health Center',
      dateText: 'Apr 14 - 16, 2027',
      eventStart: new Date('2027-04-14T00:00:00Z'),
      eventEnd: new Date('2027-04-16T00:00:00Z'),
      venue: 'The Inverness Denver',
      location: 'Englewood, CO',
      isRemote: false,
      calls: [
        {
          label: 'Call for Proposals',
          url: 'https://forms.monday.com/forms/d60408a6bf63d24ea4a06356e6271804?r=use1',
          deadline: new Date('2026-11-20T00:00:00Z'),
        },
      ],
    });
  });

  it('keeps the "National" badge out of the title and the date', () => {
    const national = events[1];
    expect(national.title).toBe('2027 Rural Medical Training Collaborative (RMTC) Annual Meeting');
    expect(national.dateText).toBe('Apr 21 - 23, 2027');
    expect(national.venue).toBe('Hyatt Regency Lake Tahoe');
    expect(national.location).toBe('Incline Village, NV');
  });

  it('reads an event listed with a city and no venue', () => {
    const researchDay = events.find((event) => event.title.includes('Appalachian Research Day'));
    expect(researchDay?.venue).toBeUndefined();
    expect(researchDay?.location).toBe('Corbin, KY');
    expect(isoDay(researchDay?.eventStart)).toBe('2027-04-15');
  });

  it('decodes entities in titles and call labels', () => {
    const titles = events.map((event) => event.title);
    expect(titles).toContain('2027 52nd Annual USAging Conference & Tradeshow');
    const labels = parseRuralHealthCallsPage(pageTwo).flatMap((event) => event.calls.map((call) => call.label));
    expect(labels).toContain('Call for Research & Educational Abstracts & Posters');
  });

  it('finds no events on a page past the end of the listing', () => {
    expect(emptyPage).toContain('There are no open calls at this time.');
    expect(parseRuralHealthCallsPage(emptyPage)).toEqual([]);
    expect(parseRuralHealthCallsPage('<html><body>maintenance</body></html>')).toEqual([]);
  });
});

describe('hasNextRuralHealthPage', () => {
  it('follows the pager until the last page', () => {
    expect(hasNextRuralHealthPage(pageOne)).toBe(true);
    expect(hasNextRuralHealthPage(pageTwo)).toBe(false);
    expect(hasNextRuralHealthPage(emptyPage)).toBe(false);
  });
});

describe('buildRuralHealthResults', () => {
  const events = [...parseRuralHealthCallsPage(pageOne), ...parseRuralHealthCallsPage(pageTwo)];
  const results = buildRuralHealthResults(events, now);

  it('maps a listed call to an opportunity', () => {
    expect(results[0]).toEqual({
      title: '2027 Colorado Rural Healthcare Conference',
      organization: 'Colorado Rural Health Center',
      description:
        'Call for Proposals for the 2027 Colorado Rural Healthcare Conference, Apr 14 - 16, 2027, The Inverness Denver, Englewood, CO. ' +
        'Organized by Colorado Rural Health Center.',
      location: 'Englewood, CO',
      isRemote: false,
      eventDate: new Date('2027-04-14T00:00:00Z'),
      // End of November 20 Anywhere on Earth (UTC-12).
      cfpDeadline: new Date('2026-11-21T11:59:59Z'),
      deadlineTimezone: null,
      format: 'conference',
      industries: ['healthcare', 'rural health'],
      applyUrl: 'https://forms.monday.com/forms/d60408a6bf63d24ea4a06356e6271804?r=use1',
      source: 'ruralhealthinfo.org',
      sourceUrl: 'https://coruralhealth.org/the-colorado-rural-healthcare-conference',
    });
  });

  it('keeps every call for presenters and drops the call for posters alone', () => {
    expect(events).toHaveLength(20);
    expect(results).toHaveLength(19);
    expect(results.map((result) => result.title)).not.toContain(
      '2027 IHS National Clinical and Community Workforce Summit',
    );
  });

  it('gives each result its own apply URL when two events share one form', () => {
    const summit = results.find((result) => result.title === '2027 12th Annual Rural Hospital Innovation Summit');
    const conference = results.find((result) => result.title === '2027 50th Annual NRHA Rural Health Conference');
    expect(summit?.applyUrl).toBe('https://fs16.formsite.com/MEAGHAN/form75/index');
    expect(conference?.applyUrl).toBe('https://www.ruralhealth.us/events/schedule/annual-rural-health-conference');
    expect(new Set(results.map((result) => result.applyUrl)).size).toBe(results.length);
  });

  it('ends the description with one full stop when the organizer is an "Inc."', () => {
    const institute = results.find((candidate) => candidate.organization === 'National Rural Alcohol & Drug Abuse Network, Inc.');
    expect(institute?.description).toMatch(/Menomonie, WI\. Organized by National Rural Alcohol & Drug Abuse Network, Inc\.$/);
  });

  it('applies through the event page when the call is a PDF', () => {
    const forum = events.find((event) => event.title === '2027 Oregon Forum on Rural Population Health');
    expect(forum?.calls[0].url).toBe('https://www.ohsu.edu/sites/default/files/2026-09/2027-forum-rfp.pdf');
    const result = results.find((candidate) => candidate.title === forum?.title);
    expect(result?.applyUrl).toBe('https://www.ohsu.edu/oregon-office-of-rural-health/forum-rural-population-health');
    expect(result?.cfpDeadline).toEqual(new Date('2026-12-12T11:59:59Z'));
  });

  it('drops calls whose deadline has passed and events that are over', () => {
    const afterFirstDeadlines = buildRuralHealthResults(events, new Date('2026-12-02T12:00:00Z'));
    expect(afterFirstDeadlines.map((result) => result.title)).not.toContain('2027 Colorado Rural Healthcare Conference');
    expect(afterFirstDeadlines).toHaveLength(13);
    expect(buildRuralHealthResults(events, new Date('2027-09-01T00:00:00Z'))).toEqual([]);
  });

  it('keeps a call that closes today', () => {
    const closingDay = buildRuralHealthResults(events, new Date('2026-11-20T23:00:00Z'));
    expect(closingDay[0].title).toBe('2027 Colorado Rural Healthcare Conference');
  });

  it('labels an online event as remote and falls back to the event page without a call link', () => {
    const online: RuralHealthEvent = {
      title: '2027 Rural Telehealth Forum',
      eventUrl: 'https://example.org/forum',
      dateText: 'Mar 3, 2027',
      eventStart: new Date('2027-03-03T00:00:00Z'),
      eventEnd: new Date('2027-03-03T00:00:00Z'),
      isRemote: true,
      calls: [{ label: 'Call for Presentations' }],
    };
    const [result] = buildRuralHealthResults([online], now);
    expect(result.applyUrl).toBe('https://example.org/forum');
    expect(result.organization).toBe('2027 Rural Telehealth Forum');
    expect(result.isRemote).toBe(true);
    expect(result.location).toBeNull();
    expect(result.cfpDeadline).toBeUndefined();
    expect(result.description).toBe('Call for Presentations for the 2027 Rural Telehealth Forum, Mar 3, 2027, held online.');
  });
});
