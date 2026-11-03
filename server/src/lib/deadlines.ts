/**
 * Deadline instants and timezones.
 *
 * A CFP deadline is a calendar day in some timezone: "November 30" means
 * "until the end of November 30 where the organizers are". `cfpDeadline`
 * stores the instant that day ends (23:59:59 in `deadlineTimezone`), so every
 * comparison against `now` is a plain instant comparison. When a page states
 * no zone the deadline is read as Anywhere on Earth (AoE, UTC-12), the academic
 * convention and the most lenient reading: a row never expires early.
 *
 * Rows written before this module stored midnight UTC of the calendar day with
 * no zone. `deadlineInstant` recognises that shape and shifts it to AoE end of
 * day, so unmigrated rows and cached client data read correctly too.
 *
 * Pure: only `Intl` for zone math, so the client imports this file as well
 * (`client/src/lib/dates.ts`) and both sides agree on what "past" means.
 */

export const AOE = 'AoE';
/** AoE is not an IANA name; Etc zones carry an inverted sign, so Etc/GMT+12 is UTC-12. */
const AOE_INTL_ZONE = 'Etc/GMT+12';
export const END_OF_DAY = '23:59:59';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_OF_DAY = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const UTC_OFFSET_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/;

/** The two columns every deadline reading needs. Strings are accepted for client-side (JSON) rows. */
export interface DeadlineFields {
  cfpDeadline: Date | string | null | undefined;
  deadlineTimezone?: string | null;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

/** Formatter for the wall-clock fields of an instant in `zone`; throws RangeError for an unknown zone. */
function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partFormatters.set(zone, formatter);
  }
  return formatter;
}

function intlZone(zone: string): string {
  return zone === AOE ? AOE_INTL_ZONE : zone;
}

/** True for `AoE` and any zone name `Intl` accepts (IANA names and aliases such as `US/Pacific`). */
export function isValidTimezone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  if (zone === AOE) return true;
  try {
    partsFormatter(zone);
    return true;
  } catch {
    return false;
  }
}

function wallClock(instant: Date, zone: string): WallClock {
  const parts = partsFormatter(intlZone(zone)).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
}

/** UTC offset of `zone` at `instant`, in minutes, positive east of Greenwich. */
export function zoneOffsetMinutes(zone: string, instant: Date): number {
  const clock = wallClock(instant, zone);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return Math.round((asUtc - instant.getTime()) / MINUTE_MS);
}

/**
 * The instant at `time` (HH:MM or HH:MM:SS, end of day when null) on the
 * calendar day `dateOnly` (YYYY-MM-DD) in `zone` (AoE when null). Null for a
 * malformed date or time, an impossible day such as Feb 31, or an unknown zone.
 */
export function instantInZone(
  dateOnly: string,
  time: string | null | undefined,
  zone: string | null | undefined
): Date | null {
  const dateMatch = DATE_ONLY.exec(dateOnly);
  const timeMatch = TIME_OF_DAY.exec(time ?? END_OF_DAY);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const calendar = new Date(wall);
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;

  const effectiveZone = zone ?? AOE;
  if (!isValidTimezone(effectiveZone)) return null;
  // Two passes: across a DST change the offset at the first guess can differ
  // from the offset in force at the wall-clock time itself.
  const firstGuess = wall - zoneOffsetMinutes(effectiveZone, new Date(wall)) * MINUTE_MS;
  const instant = wall - zoneOffsetMinutes(effectiveZone, new Date(firstGuess)) * MINUTE_MS;
  return new Date(instant);
}

/** 23:59:59 on the calendar day `dateOnly` in `zone`; null zone = AoE. */
export function endOfDayInZone(dateOnly: string, zone: string | null | undefined): Date | null {
  return instantInZone(dateOnly, END_OF_DAY, zone);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `YYYY-MM-DD` from a Date's UTC fields: the scrapers' parsers carry a calendar day as UTC midnight. */
export function calendarDate(day: Date): string {
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
}

/** End of the calendar day a UTC-midnight Date stands for, in `zone` (AoE when null). */
export function endOfCalendarDay(day: Date | null | undefined, zone?: string | null): Date | undefined {
  if (!day || Number.isNaN(day.getTime())) return undefined;
  return endOfDayInZone(calendarDate(day), zone) ?? undefined;
}

/**
 * The fixed-offset IANA zone for a whole-hour UTC offset, for sources that
 * give an offset but no zone name. Null for other offsets (there is no Etc
 * zone for +05:30). Etc/GMT names carry the inverted sign: Etc/GMT+5 is UTC-5.
 */
export function fixedOffsetZone(offsetMinutes: number): string | null {
  if (!Number.isInteger(offsetMinutes) || offsetMinutes % 60 !== 0 || Math.abs(offsetMinutes) > 14 * 60) return null;
  const hours = offsetMinutes / 60;
  if (hours === 0) return 'Etc/UTC';
  return `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`;
}

export interface ParsedDeadline {
  instant: Date;
  /** A fixed-offset zone when the value carried a whole-hour offset; null otherwise. */
  zone: string | null;
}

/**
 * A deadline from an ISO 8601 value as APIs give them: a bare `YYYY-MM-DD` is
 * a calendar day (end of day, AoE); a date-time is taken as the exact instant,
 * with its offset recorded as a fixed-offset zone when one is present.
 */
export function parseIsoDeadline(value: string | null | undefined): ParsedDeadline | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    const instant = endOfDayInZone(trimmed, null);
    return instant ? { instant, zone: null } : undefined;
  }
  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) return undefined;
  const suffix = UTC_OFFSET_SUFFIX.exec(trimmed)?.[1];
  if (!suffix) return { instant, zone: null };
  if (suffix === 'Z') return { instant, zone: 'Etc/UTC' };
  const sign = suffix[0] === '-' ? -1 : 1;
  const digits = suffix.slice(1).replace(':', '');
  const offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
  return { instant, zone: fixedOffsetZone(offset) };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The pre-timezone storage shape: midnight UTC and no zone meant "that calendar day", not that instant. */
export function isLegacyMidnightDeadline(row: DeadlineFields): boolean {
  if (row.deadlineTimezone) return false;
  const date = toDate(row.cfpDeadline);
  return date !== null && date.getTime() % DAY_MS === 0;
}

/** The instant a row's deadline passes, reading legacy midnight-UTC values as AoE end of day. */
export function deadlineInstant(row: DeadlineFields): Date | null {
  const date = toDate(row.cfpDeadline);
  if (!date) return null;
  return isLegacyMidnightDeadline(row) ? endOfDayInZone(calendarDate(date), AOE) : date;
}

export function isDeadlinePast(row: DeadlineFields, now: Date = new Date()): boolean {
  const instant = deadlineInstant(row);
  return instant !== null && instant.getTime() < now.getTime();
}

/** Whole days until the deadline instant (rounded up), negative once past; null without a deadline. */
export function daysUntilDeadline(row: DeadlineFields, now: Date = new Date()): number | null {
  const instant = deadlineInstant(row);
  if (!instant) return null;
  return Math.ceil((instant.getTime() - now.getTime()) / DAY_MS);
}

/** The zone a deadline is shown in: its own, or AoE when none (or an unknown name) is stored. */
export function deadlineZone(row: DeadlineFields): string {
  return isValidTimezone(row.deadlineTimezone) ? row.deadlineTimezone : AOE;
}

/** Short label for a zone at an instant: "AoE", "PST", "GMT+1". */
export function zoneLabel(zone: string, instant: Date): string {
  if (zone === AOE) return AOE;
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(instant)
      .find((candidate) => candidate.type === 'timeZoneName');
    return part?.value ?? zone;
  } catch {
    return zone;
  }
}

/** The browser's (or process's) zone; UTC when it cannot be determined. */
export function viewerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
const VIEWER_DAY_AND_TIME: Intl.DateTimeFormatOptions = { ...SHORT_DATE, year: undefined, ...TIME };

function sameCalendarDay(instant: Date, zoneA: string, zoneB: string): boolean {
  const a = wallClock(instant, zoneA);
  const b = wallClock(instant, zoneB);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function formatIn(instant: Date, zone: string, options: Intl.DateTimeFormatOptions): string {
  // Newer ICU puts a narrow no-break space before AM/PM; a plain space reads the same and compares predictably.
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: intlZone(zone) }).format(instant).replace(/\u202f/g, ' ');
}

export type DeadlineStyle = 'short' | 'long';

export interface FormattedDeadline {
  /** The deadline's calendar day in its own zone: "Nov 30, 2026" (long: "Monday, November 30, 2026"). */
  date: string;
  /** Wall-clock time with the zone label: "11:59 PM AoE". */
  time: string;
  /**
   * The same instant on the viewer's clock when it reads differently: "8:59 PM",
   * or "Dec 1, 3:59 AM" when that is a different calendar day; null when it reads the same.
   */
  viewerTime: string | null;
  /** "Nov 30, 2026, 11:59 PM AoE · Dec 1, 3:59 AM your time" */
  full: string;
  /** True when no usable zone is stored and Anywhere on Earth was assumed. */
  zoneAssumed: boolean;
}

export interface FormatDeadlineOptions {
  /** Defaults to the environment's zone. */
  viewerZone?: string | null;
  style?: DeadlineStyle;
}

export function formatDeadline(row: DeadlineFields, options: FormatDeadlineOptions = {}): FormattedDeadline | null {
  const instant = deadlineInstant(row);
  if (!instant) return null;
  const zone = deadlineZone(row);
  const date = formatIn(instant, zone, options.style === 'long' ? LONG_DATE : SHORT_DATE);
  const time = `${formatIn(instant, zone, TIME)} ${zoneLabel(zone, instant)}`;

  const viewerZone = options.viewerZone ?? viewerTimezone();
  const viewerReadsTheSame =
    !isValidTimezone(viewerZone) || zoneOffsetMinutes(viewerZone, instant) === zoneOffsetMinutes(zone, instant);
  const viewerTime = viewerReadsTheSame
    ? null
    : formatIn(instant, viewerZone, sameCalendarDay(instant, zone, viewerZone) ? TIME : VIEWER_DAY_AND_TIME);

  return {
    date,
    time,
    viewerTime,
    full: `${date}, ${time}${viewerTime ? ` · ${viewerTime} your time` : ''}`,
    zoneAssumed: !isValidTimezone(row.deadlineTimezone),
  };
}

/** Whole calendar days from `from` to `to`, both read on the clock of `zone`. */
function calendarDayDelta(from: Date, to: Date, zone: string): number {
  const start = wallClock(from, zone);
  const end = wallClock(to, zone);
  return Math.round(
    (Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / DAY_MS
  );
}

/**
 * "closes in 3 days (11:59 PM AoE · Dec 1, 3:59 AM your time)", "closes today (…)",
 * "closed Nov 30, 2026 (…)". Days are counted on the deadline's own calendar,
 * the one the date on the card is shown in. Null without a deadline.
 */
export function describeDeadline(row: DeadlineFields, now: Date = new Date(), viewerZone?: string | null): string | null {
  const instant = deadlineInstant(row);
  if (!instant) return null;
  const formatted = formatDeadline(row, { viewerZone: viewerZone ?? viewerTimezone() });
  if (!formatted) return null;
  const detail = `(${formatted.time}${formatted.viewerTime ? ` · ${formatted.viewerTime} your time` : ''})`;
  if (instant.getTime() < now.getTime()) return `closed ${formatted.date} ${detail}`;
  const days = calendarDayDelta(now, instant, deadlineZone(row));
  const lead = days <= 0 ? 'closes today' : days === 1 ? 'closes tomorrow' : `closes in ${days} days`;
  return `${lead} ${detail}`;
}
