/**
 * The dates this app stores: a real instant in the years 1900 to 2100.
 *
 * Postgres accepts a year past 9999, but the `pg` adapter reads it back as an
 * Invalid Date, which Prisma then refuses to write. A row holding one failed
 * every enrichment and verification of it (production, 2026-11-12). Dates
 * parsed from scraped or searched text pass through here before they are
 * stored, and a stored date passes through here before it is written back.
 */
export const EARLIEST_STORABLE_YEAR = 1900;
export const LATEST_STORABLE_YEAR = 2100;

/** The date when it is storable, else null (absent, Invalid Date or out of range). */
export function storableDate(value: Date | null | undefined): Date | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = value.getUTCFullYear();
  return year >= EARLIEST_STORABLE_YEAR && year <= LATEST_STORABLE_YEAR ? value : null;
}
