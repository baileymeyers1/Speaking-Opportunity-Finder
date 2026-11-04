import { describe, expect, it } from 'vitest';
import {
  AOE,
  calendarDate,
  daysUntilDeadline,
  deadlineInstant,
  describeDeadline,
  endOfCalendarDay,
  endOfDayInZone,
  fixedOffsetZone,
  formatDeadline,
  instantInZone,
  isDeadlinePast,
  isLegacyMidnightDeadline,
  isValidTimezone,
  parseIsoDeadline,
  zoneLabel,
  zoneOffsetMinutes,
} from './deadlines.js';

const iso = (date: Date | null | undefined) => date?.toISOString();

describe('endOfDayInZone', () => {
  it('reads a null zone as Anywhere on Earth (UTC-12)', () => {
    expect(iso(endOfDayInZone('2026-11-30', null))).toBe('2026-12-01T11:59:59.000Z');
    expect(iso(endOfDayInZone('2026-11-30', AOE))).toBe('2026-12-01T11:59:59.000Z');
  });

  it('uses the zone offset in force on that day, including DST', () => {
    expect(iso(endOfDayInZone('2026-11-30', 'America/New_York'))).toBe('2026-12-01T04:59:59.000Z');
    expect(iso(endOfDayInZone('2026-07-01', 'America/New_York'))).toBe('2026-07-02T03:59:59.000Z');
    // Clocks spring forward on 2026-03-08 in the US; the evening is already PDT.
    expect(iso(endOfDayInZone('2026-03-08', 'America/Los_Angeles'))).toBe('2026-03-09T06:59:59.000Z');
    expect(iso(endOfDayInZone('2026-11-30', 'UTC'))).toBe('2026-11-30T23:59:59.000Z');
    expect(iso(endOfDayInZone('2026-11-30', 'Asia/Kolkata'))).toBe('2026-11-30T18:29:59.000Z');
  });

  it('rejects malformed or impossible dates and unknown zones', () => {
    expect(endOfDayInZone('2026-02-31', null)).toBeNull();
    expect(endOfDayInZone('30 Nov 2026', null)).toBeNull();
    expect(endOfDayInZone('2026-11-30', 'Mars/Olympus_Mons')).toBeNull();
  });
});

describe('instantInZone', () => {
  it('places a stated time on the day in the zone', () => {
    expect(iso(instantInZone('2026-11-30', '17:00', 'Europe/Berlin'))).toBe('2026-11-30T16:00:00.000Z');
    expect(iso(instantInZone('2026-11-30', '23:59:59', AOE))).toBe('2026-12-01T11:59:59.000Z');
  });

  it('rejects an impossible time', () => {
    expect(instantInZone('2026-11-30', '25:00', null)).toBeNull();
    expect(instantInZone('2026-11-30', 'noon', null)).toBeNull();
  });
});

describe('calendar helpers', () => {
  it('turns a UTC-midnight calendar day into its end of day', () => {
    const day = new Date('2026-11-16T00:00:00Z');
    expect(calendarDate(day)).toBe('2026-11-16');
    expect(iso(endOfCalendarDay(day))).toBe('2026-11-17T11:59:59.000Z');
    expect(iso(endOfCalendarDay(day, 'Etc/GMT+5'))).toBe('2026-11-17T04:59:59.000Z');
    expect(endOfCalendarDay(undefined)).toBeUndefined();
    expect(endOfCalendarDay(new Date('nope'))).toBeUndefined();
  });

  it('maps whole-hour offsets to Etc zones with the inverted sign', () => {
    expect(fixedOffsetZone(-300)).toBe('Etc/GMT+5');
    expect(fixedOffsetZone(60)).toBe('Etc/GMT-1');
    expect(fixedOffsetZone(0)).toBe('Etc/UTC');
    expect(fixedOffsetZone(330)).toBeNull();
    expect(zoneOffsetMinutes('Etc/GMT+5', new Date('2026-11-17T04:59:00Z'))).toBe(-300);
  });

  it('accepts IANA names and aliases, AoE, and nothing else', () => {
    expect(isValidTimezone('America/Chicago')).toBe(true);
    expect(isValidTimezone('US/Pacific')).toBe(true);
    expect(isValidTimezone(AOE)).toBe(true);
    // ICU accepts the legacy ids PST/EST/MST too; only names it has never heard of are rejected.
    expect(isValidTimezone('Pacific Time')).toBe(false);
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('parseIsoDeadline', () => {
  it('reads a bare date as an AoE calendar day', () => {
    expect(parseIsoDeadline('2026-11-30')).toEqual({ instant: new Date('2026-12-01T11:59:59Z'), zone: null });
  });

  it('keeps a date-time as the exact instant and records a whole-hour offset as a zone', () => {
    expect(parseIsoDeadline('2026-11-30T23:59:00+01:00')).toEqual({ instant: new Date('2026-11-30T22:59:00Z'), zone: 'Etc/GMT-1' });
    expect(parseIsoDeadline('2026-11-30T23:59:00-0500')).toEqual({ instant: new Date('2026-12-01T04:59:00Z'), zone: 'Etc/GMT+5' });
    expect(parseIsoDeadline('2026-11-30T23:59:00Z')).toEqual({ instant: new Date('2026-11-30T23:59:00Z'), zone: 'Etc/UTC' });
    expect(parseIsoDeadline('2026-11-30T23:59:00+05:30')?.zone).toBeNull();
    expect(parseIsoDeadline('not a date')).toBeUndefined();
    expect(parseIsoDeadline(null)).toBeUndefined();
  });
});

describe('deadlineInstant', () => {
  it('shifts a legacy midnight-UTC value with no zone to AoE end of day', () => {
    const legacy = { cfpDeadline: new Date('2026-11-30T00:00:00Z'), deadlineTimezone: null };
    expect(isLegacyMidnightDeadline(legacy)).toBe(true);
    expect(iso(deadlineInstant(legacy))).toBe('2026-12-01T11:59:59.000Z');
    expect(iso(deadlineInstant({ cfpDeadline: '2026-11-30T00:00:00.000Z' }))).toBe('2026-12-01T11:59:59.000Z');
  });

  it('keeps a stored instant that carries a zone or a time of day', () => {
    expect(iso(deadlineInstant({ cfpDeadline: new Date('2026-11-30T00:00:00Z'), deadlineTimezone: 'UTC' }))).toBe('2026-11-30T00:00:00.000Z');
    expect(iso(deadlineInstant({ cfpDeadline: '2026-12-01T04:59:59.000Z', deadlineTimezone: null }))).toBe('2026-12-01T04:59:59.000Z');
  });

  it('returns null without a usable deadline', () => {
    expect(deadlineInstant({ cfpDeadline: null })).toBeNull();
    expect(deadlineInstant({ cfpDeadline: undefined })).toBeNull();
    expect(deadlineInstant({ cfpDeadline: 'soon' })).toBeNull();
  });
});

describe('isDeadlinePast / daysUntilDeadline', () => {
  const legacyToday = { cfpDeadline: '2026-11-30T00:00:00.000Z', deadlineTimezone: null };

  it('keeps a deadline "today" open at 11 PM Pacific and closes it after AoE midnight', () => {
    const elevenPmPacificNov30 = new Date('2026-12-01T07:00:00Z');
    expect(isDeadlinePast(legacyToday, elevenPmPacificNov30)).toBe(false);
    expect(isDeadlinePast(legacyToday, new Date('2026-12-01T11:59:59Z'))).toBe(false);
    expect(isDeadlinePast(legacyToday, new Date('2026-12-01T12:00:00Z'))).toBe(true);
  });

  it('closes a zoned deadline at its own end of day', () => {
    const berlin = { cfpDeadline: new Date('2026-11-30T22:59:59Z'), deadlineTimezone: 'Europe/Berlin' };
    expect(isDeadlinePast(berlin, new Date('2026-11-30T22:00:00Z'))).toBe(false);
    expect(isDeadlinePast(berlin, new Date('2026-11-30T23:30:00Z'))).toBe(true);
  });

  it('counts days to the instant and reports null without a deadline', () => {
    expect(daysUntilDeadline(legacyToday, new Date('2026-11-28T12:00:00Z'))).toBe(3);
    expect(daysUntilDeadline(legacyToday, new Date('2026-12-02T12:00:00Z'))).toBe(-1);
    expect(daysUntilDeadline({ cfpDeadline: null }, new Date())).toBeNull();
    expect(isDeadlinePast({ cfpDeadline: null })).toBe(false);
  });
});

describe('formatting', () => {
  const aoe = { cfpDeadline: '2026-12-01T11:59:59.000Z', deadlineTimezone: AOE };

  it('labels zones', () => {
    const winter = new Date('2026-12-01T12:00:00Z');
    expect(zoneLabel(AOE, winter)).toBe(AOE);
    expect(zoneLabel('America/Los_Angeles', winter)).toBe('PST');
    expect(zoneLabel('America/Los_Angeles', new Date('2026-07-01T12:00:00Z'))).toBe('PDT');
    expect(zoneLabel('Etc/GMT+5', winter)).toBe('GMT-5');
  });

  it('shows the deadline on its own calendar and on the viewer clock', () => {
    const formatted = formatDeadline(aoe, { viewerZone: 'America/Los_Angeles' });
    expect(formatted).toEqual({
      date: 'Nov 30, 2026',
      time: '11:59 PM AoE',
      viewerTime: 'Dec 1, 3:59 AM',
      full: 'Nov 30, 2026, 11:59 PM AoE · Dec 1, 3:59 AM your time',
      zoneAssumed: false,
    });
    expect(formatDeadline(aoe, { viewerZone: 'America/Los_Angeles', style: 'long' })?.date).toBe('Monday, November 30, 2026');
  });

  it('omits the viewer time when the viewer clock reads the same, and flags an assumed zone', () => {
    const formatted = formatDeadline({ cfpDeadline: '2026-12-01T11:59:59.000Z', deadlineTimezone: null }, { viewerZone: 'Etc/GMT+12' });
    expect(formatted?.viewerTime).toBeNull();
    expect(formatted?.full).toBe('Nov 30, 2026, 11:59 PM AoE');
    expect(formatted?.zoneAssumed).toBe(true);
  });

  it('formats a zoned deadline in that zone, dating the viewer time only across a day boundary', () => {
    const chicago = { cfpDeadline: '2026-12-01T23:00:00.000Z', deadlineTimezone: 'America/Chicago' };
    expect(formatDeadline(chicago, { viewerZone: 'Europe/Berlin' })?.full).toBe('Dec 1, 2026, 5:00 PM CST · Dec 2, 12:00 AM your time');
    expect(formatDeadline(chicago, { viewerZone: 'America/New_York' })?.full).toBe('Dec 1, 2026, 5:00 PM CST · 6:00 PM your time');
    expect(formatDeadline({ cfpDeadline: null })).toBeNull();
  });

  it('describes how long is left, counted on the deadline calendar', () => {
    const viewer = 'America/Los_Angeles';
    expect(describeDeadline(aoe, new Date('2026-11-27T12:00:00Z'), viewer)).toBe(
      'closes in 3 days (11:59 PM AoE · Dec 1, 3:59 AM your time)'
    );
    expect(describeDeadline(aoe, new Date('2026-11-30T06:00:00Z'), viewer)).toBe(
      'closes tomorrow (11:59 PM AoE · Dec 1, 3:59 AM your time)'
    );
    // 11 PM Pacific on Nov 30 is still Nov 30 in AoE.
    expect(describeDeadline(aoe, new Date('2026-12-01T07:00:00Z'), viewer)).toBe(
      'closes today (11:59 PM AoE · Dec 1, 3:59 AM your time)'
    );
    expect(describeDeadline(aoe, new Date('2026-12-02T00:00:00Z'), viewer)).toBe(
      'closed Nov 30, 2026 (11:59 PM AoE · Dec 1, 3:59 AM your time)'
    );
    expect(describeDeadline({ cfpDeadline: null }, new Date(), viewer)).toBeNull();
  });
});
