import { prisma } from '../../lib/prisma.js';
import { CLAIM_STALE_MS, DAILY_ENRICHMENT_LIMIT, MAX_ENRICHMENT_ATTEMPTS, utcDateKey } from '../enrichmentBudget.js';
import { verificationCandidates } from '../verification.js';
import { startOfUtcDay } from '../../scrapers/lib/html.js';
import type { AdminPipelineEvent, AdminPipelineResponse } from 'shared';
import { daysAgo } from './shared.js';

/**
 * Where the enrichment and verification queues stand, whether the scheduled
 * jobs are alive, and the last few things that happened. Everything is read
 * from the database: on Vercel there is no process memory to ask.
 */

export const PIPELINE_EVENT_LIMIT = 10;

export interface RunEventRow {
  scraper: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  found: number;
  added: number;
  updated: number;
  error: string | null;
}

export interface EnrichedEventRow {
  title: string;
  enrichedAt: Date | null;
  enrichmentStatus: string | null;
  enrichmentError: string | null;
  isClosed: boolean;
  isRelevant: boolean;
}

export interface VerifiedEventRow {
  title: string;
  verifiedAt: Date | null;
  verificationError: string | null;
  isClosed: boolean;
}

function runEvent(run: RunEventRow): AdminPipelineEvent {
  const at = run.finishedAt ?? run.startedAt;
  if (run.status === 'error') {
    return { at: at.toISOString(), kind: 'scraper-run', status: 'error', summary: `${run.scraper}: run failed`, detail: run.error };
  }
  return {
    at: at.toISOString(),
    kind: 'scraper-run',
    status: 'ok',
    summary: `${run.scraper}: ${run.found} found, ${run.added} added, ${run.updated} updated`,
    detail: run.found === 0 ? 'Returned no rows' : null,
  };
}

function enrichedEvent(row: EnrichedEventRow): AdminPipelineEvent | null {
  if (!row.enrichedAt) return null;
  const at = row.enrichedAt.toISOString();
  if (row.enrichmentStatus === 'failed') {
    return { at, kind: 'enrichment', status: 'error', summary: `Gave up on "${row.title}"`, detail: row.enrichmentError };
  }
  if (row.enrichmentStatus === 'skipped') {
    return { at, kind: 'enrichment', status: 'ok', summary: `Skipped "${row.title}"`, detail: row.enrichmentError };
  }
  const flags = [row.isClosed ? 'closed' : null, row.isRelevant ? null : 'not relevant'].filter(Boolean);
  return {
    at,
    kind: 'enrichment',
    status: 'ok',
    summary: `Enriched "${row.title}"`,
    detail: flags.length ? `Marked ${flags.join(', ')}` : null,
  };
}

function verifiedEvent(row: VerifiedEventRow): AdminPipelineEvent | null {
  if (!row.verifiedAt) return null;
  const at = row.verifiedAt.toISOString();
  if (row.verificationError && !row.isClosed) {
    return { at, kind: 'verification', status: 'error', summary: `Could not verify "${row.title}"`, detail: row.verificationError };
  }
  return {
    at,
    kind: 'verification',
    status: 'ok',
    summary: `Verified "${row.title}"`,
    detail: row.isClosed ? `Now closed${row.verificationError ? `: ${row.verificationError}` : ''}` : null,
  };
}

/** Merge the three event streams, newest first, capped at PIPELINE_EVENT_LIMIT. */
export function buildPipelineEvents(input: {
  runs: RunEventRow[];
  enriched: EnrichedEventRow[];
  verified: VerifiedEventRow[];
}): AdminPipelineEvent[] {
  const events: AdminPipelineEvent[] = [
    ...input.runs.filter((run) => run.status !== 'running').map(runEvent),
    ...input.enriched.map(enrichedEvent).filter((event): event is AdminPipelineEvent => event !== null),
    ...input.verified.map(verifiedEvent).filter((event): event is AdminPipelineEvent => event !== null),
  ];
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, PIPELINE_EVENT_LIMIT);
}

export function latestOf(...dates: Array<Date | null | undefined>): string | null {
  let latest: Date | null = null;
  for (const date of dates) {
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest?.toISOString() ?? null;
}

export async function getPipeline(now: Date = new Date()): Promise<AdminPipelineResponse> {
  const staleClaimBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  const dayAgo = daysAgo(1, now);
  const today = startOfUtcDay(now);
  const [deadlineSoon, stale] = verificationCandidates(now);
  const visible = {
    isClosed: false,
    isRelevant: true,
    OR: [{ cfpDeadline: { gte: today } }, { cfpDeadline: null }],
  };

  const [
    backlog,
    claimed,
    staleClaims,
    failed,
    enrichedLast24h,
    enrichedMax,
    usage,
    dueDeadlineSoon,
    dueStale,
    due,
    withError,
    lowConfidenceDates,
    verifiedLast24h,
    verifiedMax,
    dailySync,
    weeklySync,
    recentRuns,
    recentEnriched,
    recentVerified,
  ] = await Promise.all([
    prisma.opportunity.count({ where: { enrichmentStatus: null, enrichmentAttempts: { lt: MAX_ENRICHMENT_ATTEMPTS } } }),
    prisma.opportunity.count({ where: { enrichmentClaimedAt: { gte: staleClaimBefore } } }),
    prisma.opportunity.count({ where: { enrichmentClaimedAt: { lt: staleClaimBefore } } }),
    prisma.opportunity.count({ where: { enrichmentStatus: 'failed' } }),
    prisma.opportunity.count({ where: { enrichedAt: { gte: dayAgo } } }),
    prisma.opportunity.aggregate({ _max: { enrichedAt: true } }),
    prisma.enrichmentUsage.findUnique({ where: { date: utcDateKey(now) } }),
    prisma.opportunity.count({ where: deadlineSoon.where }),
    prisma.opportunity.count({ where: stale.where }),
    prisma.opportunity.count({ where: { OR: [deadlineSoon.where, stale.where] } }),
    prisma.opportunity.count({ where: { ...visible, verificationError: { not: null } } }),
    prisma.opportunity.count({
      where: {
        ...visible,
        AND: [{ OR: [{ dateConfidence: { contains: '"cfpDeadline":"low"' } }, { dateConfidence: { contains: '"eventDate":"low"' } }] }],
      },
    }),
    prisma.opportunity.count({ where: { verifiedAt: { gte: dayAgo } } }),
    prisma.opportunity.aggregate({ _max: { verifiedAt: true } }),
    prisma.scraperRun.aggregate({ _max: { startedAt: true }, where: { cadence: 'daily' } }),
    prisma.scraperRun.aggregate({ _max: { startedAt: true }, where: { cadence: 'weekly' } }),
    prisma.scraperRun.findMany({ orderBy: { startedAt: 'desc' }, take: PIPELINE_EVENT_LIMIT }),
    prisma.opportunity.findMany({
      where: { enrichedAt: { not: null } },
      orderBy: { enrichedAt: 'desc' },
      take: PIPELINE_EVENT_LIMIT,
      select: { title: true, enrichedAt: true, enrichmentStatus: true, enrichmentError: true, isClosed: true, isRelevant: true },
    }),
    prisma.opportunity.findMany({
      where: { verifiedAt: { not: null } },
      orderBy: { verifiedAt: 'desc' },
      take: PIPELINE_EVENT_LIMIT,
      select: { title: true, verifiedAt: true, verificationError: true, isClosed: true },
    }),
  ]);

  return {
    enrichment: {
      backlog,
      claimed,
      staleClaims,
      failed,
      enrichedLast24h,
      lastEnrichedAt: latestOf(enrichedMax._max.enrichedAt),
    },
    budget: { date: utcDateKey(now), used: usage?.count ?? 0, limit: DAILY_ENRICHMENT_LIMIT },
    verification: {
      due,
      dueDeadlineSoon,
      dueStale,
      withError,
      lowConfidenceDates,
      verifiedLast24h,
      lastVerifiedAt: latestOf(verifiedMax._max.verifiedAt),
    },
    crons: {
      dailySyncAt: latestOf(dailySync._max.startedAt),
      weeklySyncAt: latestOf(weeklySync._max.startedAt),
      enrichmentAt: latestOf(enrichedMax._max.enrichedAt, verifiedMax._max.verifiedAt),
      enrichmentHasWork: backlog > 0 || due > 0,
    },
    events: buildPipelineEvents({ runs: recentRuns, enriched: recentEnriched, verified: recentVerified }),
    generatedAt: now.toISOString(),
  };
}
