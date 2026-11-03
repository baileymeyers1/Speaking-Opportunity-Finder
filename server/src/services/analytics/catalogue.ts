import { prisma } from '../../lib/prisma.js';
import { startOfUtcDay } from '../../scrapers/lib/html.js';
import type { AdminCatalogueResponse } from 'shared';
import { countJsonArrayValues, DAY_MS, daysAgo } from './shared.js';

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
  const deadlineBetween = (fromDays: number, toDays: number | null) => ({
    isClosed: false,
    isRelevant: true,
    cfpDeadline: {
      gte: new Date(today.getTime() + fromDays * DAY_MS),
      ...(toDays === null ? {} : { lt: new Date(today.getTime() + toDays * DAY_MS) }),
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
    generatedAt: now.toISOString(),
  };
}
