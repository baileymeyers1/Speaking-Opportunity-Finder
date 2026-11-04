import { prisma } from '../../lib/prisma.js';
import { startOfUtcDay } from '../../scrapers/lib/html.js';
import type { AdminCatalogueResponse } from 'shared';
import { countJsonArrayValues, DAY_MS, daysAgo } from './shared.js';
import { getEventStats } from './events.js';

/** What the catalogue looks like to a visitor: active rows by format, industry, deadline and location. */

export const TOP_INDUSTRIES = 15;
/** Industry counts are computed in memory; this bounds the scan. */
const INDUSTRY_SCAN_LIMIT = 5000;

export async function getCatalogue(now: Date = new Date()): Promise<AdminCatalogueResponse> {
  const today = startOfUtcDay(now);
  const active = {
    isClosed: false,
    isRelevant: true,
    OR: [{ cfpDeadline: { gte: today } }, { cfpDeadline: null }],
  };
  // A deadline is stored as the end of its day in its zone, AoE (UTC-12) by
  // default, so "day N" closes at 11:59:59 UTC on day N+1. An edge at noon UTC
  // of day N+1 puts day N's deadline in the earlier bucket for every zone west
  // of UTC+12; the first bucket starts at today so a not-yet-migrated
  // midnight-UTC row for today still counts.
  const bucketEdge = (days: number) => new Date(today.getTime() + days * DAY_MS + DAY_MS / 2);
  const deadlineBetween = (fromDays: number, toDays: number | null) => ({
    isClosed: false,
    isRelevant: true,
    cfpDeadline: {
      gte: fromDays === 0 ? today : bucketEdge(fromDays),
      ...(toDays === null ? {} : { lt: bucketEdge(toDays) }),
    },
  });

  const [
    all,
    activeCount,
    closed,
    irrelevant,
    expired,
    formatGroups,
    industryRows,
    within7Days,
    within30Days,
    within90Days,
    later,
    noDeadline,
    closedThisWeek,
    remote,
    events,
  ] = await Promise.all([
    prisma.opportunity.count(),
    prisma.opportunity.count({ where: active }),
    prisma.opportunity.count({ where: { isClosed: true } }),
    prisma.opportunity.count({ where: { isRelevant: false } }),
    prisma.opportunity.count({ where: { isClosed: false, isRelevant: true, cfpDeadline: { lt: today } } }),
    prisma.opportunity.groupBy({ by: ['format'], _count: { id: true }, where: active }),
    prisma.opportunity.findMany({ where: active, select: { industries: true }, take: INDUSTRY_SCAN_LIMIT }),
    prisma.opportunity.count({ where: deadlineBetween(0, 7) }),
    prisma.opportunity.count({ where: deadlineBetween(7, 30) }),
    prisma.opportunity.count({ where: deadlineBetween(30, 90) }),
    prisma.opportunity.count({ where: deadlineBetween(90, null) }),
    prisma.opportunity.count({ where: { isClosed: false, isRelevant: true, cfpDeadline: null } }),
    // There is no closedAt column; a closed row's updatedAt moves when the flag is set.
    prisma.opportunity.count({ where: { isClosed: true, updatedAt: { gte: daysAgo(7, now) } } }),
    prisma.opportunity.count({ where: { ...active, isRemote: true } }),
    getEventStats(),
  ]);

  return {
    totals: { all, active: activeCount, closed, irrelevant, expired },
    byFormat: formatGroups
      .map((group) => ({ label: group.format, count: group._count.id }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    byIndustry: countJsonArrayValues(
      industryRows.map((row) => row.industries),
      TOP_INDUSTRIES
    ),
    byDeadline: { within7Days, within30Days, within90Days, later, noDeadline },
    closedThisWeek,
    remote,
    inPerson: activeCount - remote,
    events,
    generatedAt: now.toISOString(),
  };
}
