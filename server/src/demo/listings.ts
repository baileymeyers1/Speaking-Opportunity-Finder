import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { LIVE_SEARCH_SOURCE } from '../services/searchSources.js';
import { demoListingsSource } from './env.js';

/**
 * The demo browses a copy of production's listed calls, read from production's public API (the same list
 * anyone sees on the site), so it never needs production's database. The copy is refreshed at every deploy
 * and once a day (`/api/cron/demo-listings`). Rows keep production's ids, so a link to a call stays valid.
 */

/** One row of production's public list: every Opportunity column, as JSON, plus what the list adds. */
export type PublicListing = Record<string, unknown> & { id: string; applyUrl: string };

/** Where the refresh time is kept (an EnrichmentUsage row, whose `date` is a free key). */
export const LISTINGS_REFRESH_KEY = 'demo-listings-refreshed';

/** How long the demo keeps the hits its own live searches stored, once production no longer lists them. */
const DEMO_HIT_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

const DATE_COLUMNS = ['eventDate', 'cfpDeadline', 'createdAt', 'updatedAt', 'enrichedAt', 'enrichmentClaimedAt', 'verifiedAt'];
/** Text columns the API sends parsed (the database keeps them as JSON strings). */
const JSON_TEXT_COLUMNS = ['industries', 'dateConfidence'];
const COLUMNS = [
  'id', 'title', 'organization', 'description', 'location', 'isRemote', 'eventDate', 'cfpDeadline', 'format',
  'industries', 'sectors', 'compensationType', 'compensationAmount', 'compensationDetails', 'applyUrl',
  'qualityScore', 'source', 'sourceUrl', 'createdAt', 'updatedAt', 'enrichmentStatus', 'enrichedAt',
  'enrichmentError', 'enrichmentAttempts', 'enrichmentClaimedAt', 'isClosed', 'isRelevant', 'hasOpenCall',
  'verifiedAt', 'verificationError', 'dateConfidence', 'deadlineTimezone', 'editionYear',
] as const;

/**
 * A public listing as an Opportunity row. Event links are dropped: the demo has no events table to point
 * at, and production's list already shows one row per event.
 */
export function toOpportunityRow(listing: PublicListing): Prisma.OpportunityCreateManyInput {
  const row: Record<string, unknown> = {};
  for (const column of COLUMNS) {
    let value = listing[column];
    if (value === undefined) continue;
    if (DATE_COLUMNS.includes(column) && typeof value === 'string') value = new Date(value);
    if (JSON_TEXT_COLUMNS.includes(column) && value !== null && typeof value !== 'string') value = JSON.stringify(value);
    row[column] = value;
  }
  row.sectors = Array.isArray(listing.sectors) ? listing.sectors : [];
  row.eventId = null;
  row.possibleEventId = null;
  row.possibleEventScore = null;
  return row as Prisma.OpportunityCreateManyInput;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Every listed call on production, in pages of 1000. */
export async function fetchPublicListings(source = demoListingsSource(), fetchImpl: FetchLike = fetch): Promise<PublicListing[]> {
  const listings: PublicListing[] = [];
  for (let page = 1; page <= 20; page++) {
    const response = await fetchImpl(`${source}/api/opportunities?pageSize=1000&page=${page}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Listings source answered ${response.status}`);
    const body = (await response.json()) as { success?: boolean; data?: { items?: PublicListing[]; total?: number } };
    const items = body.data?.items;
    if (!body.success || !Array.isArray(items)) throw new Error('Listings source sent an unexpected shape');
    listings.push(...items.filter((item) => typeof item?.id === 'string' && typeof item?.applyUrl === 'string'));
    if (items.length === 0 || listings.length >= (body.data?.total ?? 0)) break;
  }
  return listings;
}

export interface RefreshResult {
  listed: number;
  created: number;
  updated: number;
  removed: number;
}

/**
 * Brings the demo's listings in line with production's public list: new calls are added, known ones updated,
 * and calls production no longer lists are removed (with any visitor's saves of them), except the demo's own
 * recent live-search hits. Refuses an empty list rather than wiping the demo.
 */
export async function refreshDemoListings(
  prisma: PrismaClient,
  {
    listings,
    now = new Date(),
    removalScope = {},
  }: {
    listings: PublicListing[];
    now?: Date;
    /** Which stored rows a removal may touch: all of them in the demo; tests narrow it to their own. */
    removalScope?: Prisma.OpportunityWhereInput;
  }
): Promise<RefreshResult> {
  if (listings.length === 0) throw new Error('The listings source returned no calls; keeping the current copy');
  const rows = listings.map(toOpportunityRow);
  const ids = rows.map((row) => row.id as string);

  const existing = new Set(
    (await prisma.opportunity.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((row) => row.id)
  );
  const fresh = rows.filter((row) => !existing.has(row.id as string));
  const known = rows.filter((row) => existing.has(row.id as string));

  // skipDuplicates: a demo live-search hit may already hold the same apply URL; the demo's row stays.
  const { count: created } = await prisma.opportunity.createMany({ data: fresh, skipDuplicates: true });
  for (let start = 0; start < known.length; start += 100) {
    await prisma.$transaction(
      known.slice(start, start + 100).map(({ id, applyUrl: _applyUrl, ...data }) =>
        prisma.opportunity.update({ where: { id: id as string }, data })
      )
    );
  }
  const { count: removed } = await prisma.opportunity.deleteMany({
    where: {
      ...removalScope,
      id: { notIn: ids },
      NOT: { source: LIVE_SEARCH_SOURCE, createdAt: { gt: new Date(now.getTime() - DEMO_HIT_KEEP_MS) } },
    },
  });
  await prisma.enrichmentUsage.upsert({
    where: { date: LISTINGS_REFRESH_KEY },
    create: { date: LISTINGS_REFRESH_KEY, count: rows.length },
    update: { count: rows.length },
  });
  return { listed: rows.length, created, updated: known.length, removed };
}
