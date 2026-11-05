import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import type { EventEdition, PreviousEdition } from 'shared';
import { LIVE_SEARCH_SOURCE } from './opportunityQuery.js';

/**
 * What a list or detail response says about an opportunity's canonical event:
 * which rows of the same event to hide (one card per event), which other
 * sources list the same edition, and what earlier years looked like.
 */

/** The visibility rule of the default list, as SQL. Mirrors `buildOpportunityWhere`. */
const MIN_QUALITY_SCORE = 15;

/**
 * Ids of rows hidden by grouping: for every event with visible rows, every
 * visible row except the one with the nearest open deadline (no deadline
 * last, then id). Computed in SQL with a window function so pagination over
 * the remaining rows stays exact; only the hidden ids come back.
 */
export async function shadowedEditionIds(now: Date = new Date()): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY "eventId"
               ORDER BY "cfpDeadline" ASC NULLS LAST, id ASC
             ) AS rank
      FROM "Opportunity"
      WHERE "eventId" IS NOT NULL
        AND "isClosed" = false
        AND "isRelevant" = true
        AND "qualityScore" >= ${MIN_QUALITY_SCORE}
        AND ("cfpDeadline" IS NULL OR "cfpDeadline" >= ${now})
        AND NOT ("source" = ${LIVE_SEARCH_SOURCE} AND "enrichmentStatus" IS DISTINCT FROM 'enriched')
    )
    SELECT id FROM ranked WHERE rank > 1
  `);
  return rows.map((row) => row.id);
}

export interface EventRowLike {
  id: string;
  eventId?: string | null;
  editionYear?: number | null;
  source: string;
  eventDate: Date | null;
}

export interface EventContext {
  alsoListedOn: string[];
  previousEditions: PreviousEdition<Date>[];
  /** Every row of the event, newest year first; only present when there is more than one. */
  eventEditions?: EventEdition<Date>[];
}

const editionSelect = {
  id: true,
  eventId: true,
  editionYear: true,
  title: true,
  source: true,
  applyUrl: true,
  cfpDeadline: true,
  eventDate: true,
  createdAt: true,
  isClosed: true,
} satisfies Prisma.OpportunitySelect;

type EditionRow = Prisma.OpportunityGetPayload<{ select: typeof editionSelect }>;

/** The year a sibling row counts as, falling back to its event date so undated titles still group. */
function yearOf(row: { editionYear: number | null; eventDate: Date | null }): number | null {
  return row.editionYear ?? row.eventDate?.getUTCFullYear() ?? null;
}

function toEdition(row: EditionRow): EventEdition<Date> {
  return {
    id: row.id,
    year: yearOf(row),
    title: row.title,
    source: row.source,
    applyUrl: row.applyUrl,
    cfpDeadline: row.cfpDeadline,
    eventDate: row.eventDate,
    isClosed: row.isClosed,
  };
}

/**
 * Pure: the context of one row given every row of its event. The editions
 * ride on list items too, because the detail page renders from the cached
 * list entry it was opened from and only refetches once that is stale.
 */
export function buildEventContext(row: EventRowLike, siblings: EditionRow[]): EventContext {
  const year = yearOf({ editionYear: row.editionYear ?? null, eventDate: row.eventDate });
  const others = siblings.filter((s) => s.id !== row.id);
  const sameEdition = others.filter((s) => year === null || yearOf(s) === null || yearOf(s) === year);
  const alsoListedOn = [...new Set(sameEdition.map((s) => s.source).filter((source) => source !== row.source))].sort();

  const byYear = new Map<number, PreviousEdition<Date>>();
  for (const sibling of others) {
    const siblingYear = yearOf(sibling);
    if (siblingYear === null || year === null || siblingYear >= year) continue;
    const current = byYear.get(siblingYear);
    const candidate: PreviousEdition<Date> = {
      year: siblingYear,
      cfpDeadline: sibling.cfpDeadline,
      eventDate: sibling.eventDate,
      firstSeenAt: sibling.createdAt,
    };
    // One entry per year: the row stored first is the best guess at when the call opened.
    if (!current || candidate.firstSeenAt < current.firstSeenAt) {
      byYear.set(siblingYear, { ...candidate, cfpDeadline: candidate.cfpDeadline ?? current?.cfpDeadline ?? null });
    } else if (current.cfpDeadline === null && candidate.cfpDeadline) {
      byYear.set(siblingYear, { ...current, cfpDeadline: candidate.cfpDeadline });
    }
  }
  const previousEditions = [...byYear.values()].sort((a, b) => b.year - a.year);
  const context: EventContext = { alsoListedOn, previousEditions };
  if (siblings.length > 1) {
    context.eventEditions = siblings
      .map(toEdition)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.source.localeCompare(b.source));
  }
  return context;
}

/** Every row of the given events, in one query. */
async function loadEditions(eventIds: string[]): Promise<Map<string, EditionRow[]>> {
  const byEvent = new Map<string, EditionRow[]>();
  if (eventIds.length === 0) return byEvent;
  const rows = await prisma.opportunity.findMany({ where: { eventId: { in: eventIds } }, select: editionSelect });
  for (const row of rows) {
    const list = byEvent.get(row.eventId!) ?? [];
    list.push(row);
    byEvent.set(row.eventId!, list);
  }
  return byEvent;
}

/** Adds `alsoListedOn` and `previousEditions` to the rows of a page (one query for the whole page). */
export async function attachEventContext<T extends EventRowLike>(items: T[]): Promise<Array<T & EventContext>> {
  const eventIds = [...new Set(items.map((item) => item.eventId).filter((id): id is string => Boolean(id)))];
  const editions = await loadEditions(eventIds);
  return items.map((item) => ({
    ...item,
    ...buildEventContext(item, item.eventId ? editions.get(item.eventId) ?? [] : []),
  }));
}
