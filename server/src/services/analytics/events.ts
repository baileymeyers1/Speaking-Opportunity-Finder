import { prisma } from '../../lib/prisma.js';
import { AUTO_LINK_SCORE, REVIEW_SCORE } from '../eventMatching.js';
import type { AdminEventStats, AdminPossibleDuplicate } from 'shared';

/** Canonical events for the admin catalogue: how much the matcher folds together, and what it left for review. */

const POSSIBLE_DUPLICATES_SHOWN = 25;

export interface EventGroup {
  eventId: string;
  source: string;
  editionYear: number | null;
  count: number;
}

/** Pure: event totals from (event, source, year) groups. */
export function summarizeEventGroups(
  groups: EventGroup[]
): Pick<AdminEventStats, 'events' | 'linkedRows' | 'rowsPerEvent' | 'multiSourceEvents' | 'multiYearEvents'> {
  const sources = new Map<string, Set<string>>();
  const years = new Map<string, Set<number>>();
  let linkedRows = 0;
  for (const group of groups) {
    linkedRows += group.count;
    sources.set(group.eventId, (sources.get(group.eventId) ?? new Set()).add(group.source));
    if (group.editionYear !== null) years.set(group.eventId, (years.get(group.eventId) ?? new Set()).add(group.editionYear));
  }
  const events = sources.size;
  return {
    events,
    linkedRows,
    rowsPerEvent: events > 0 ? Math.round((linkedRows / events) * 10) / 10 : 0,
    multiSourceEvents: [...sources.values()].filter((set) => set.size > 1).length,
    multiYearEvents: [...years.values()].filter((set) => set.size > 1).length,
  };
}

async function listPossibleDuplicates(): Promise<AdminPossibleDuplicate[]> {
  const rows = await prisma.opportunity.findMany({
    where: { possibleEventScore: { not: null }, possibleEventId: { not: null } },
    orderBy: [{ possibleEventScore: 'desc' }, { id: 'asc' }],
    take: POSSIBLE_DUPLICATES_SHOWN,
    select: {
      id: true,
      title: true,
      source: true,
      eventDate: true,
      possibleEventId: true,
      possibleEventScore: true,
      event: { select: { canonicalName: true } },
    },
  });
  const possibleIds = [...new Set(rows.map((row) => row.possibleEventId!))];
  const possibleEvents = await prisma.event.findMany({ where: { id: { in: possibleIds } }, select: { id: true, canonicalName: true } });
  const nameOf = new Map(possibleEvents.map((event) => [event.id, event.canonicalName]));
  return rows.map((row) => ({
    opportunityId: row.id,
    title: row.title,
    source: row.source,
    eventDate: row.eventDate?.toISOString() ?? null,
    ownEvent: row.event?.canonicalName ?? null,
    possibleEventId: row.possibleEventId!,
    possibleEvent: nameOf.get(row.possibleEventId!) ?? null,
    score: row.possibleEventScore!,
  }));
}

export async function getEventStats(): Promise<AdminEventStats> {
  const [groups, unlinkedRows, possibleDuplicates] = await Promise.all([
    prisma.opportunity.groupBy({
      by: ['eventId', 'source', 'editionYear'],
      _count: { id: true },
      where: { eventId: { not: null } },
    }),
    prisma.opportunity.count({ where: { eventId: null } }),
    listPossibleDuplicates(),
  ]);
  return {
    ...summarizeEventGroups(
      groups.map((group) => ({ eventId: group.eventId!, source: group.source, editionYear: group.editionYear, count: group._count.id }))
    ),
    unlinkedRows,
    thresholds: { autoLink: AUTO_LINK_SCORE, review: REVIEW_SCORE },
    possibleDuplicates,
  };
}
