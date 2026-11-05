import type { PendingLiveHit } from 'shared';
import { prisma } from '../lib/prisma.js';
import { enrichRowsNow } from './backgroundEnrichment.js';
import { DAILY_ENRICHMENT_LIMIT, getTodayEnrichmentCount } from './enrichmentBudget.js';
import { LIVE_SEARCH_SOURCE } from './opportunityQuery.js';

/**
 * What a live search knows about its hits in the database: which were stored
 * before, which are still waiting to be read, and how many were read and
 * found not to be open calls for speakers.
 */

export interface StoredHits {
  urls: Set<string>;
  /** Ids of hits an earlier live search stored and nobody has read yet, best first as given. */
  waitingIds: string[];
}

/** Which of these apply URLs already have a row, and which of those still wait to be read. */
export async function findStoredHits(urls: readonly string[]): Promise<StoredHits> {
  if (urls.length === 0) return { urls: new Set(), waitingIds: [] };
  try {
    const rows = await prisma.opportunity.findMany({
      where: { applyUrl: { in: [...urls] } },
      select: { id: true, applyUrl: true, source: true, enrichmentStatus: true },
    });
    const order = new Map(urls.map((url, index) => [url, index]));
    const waiting = rows
      .filter((row) => row.source === LIVE_SEARCH_SOURCE && row.enrichmentStatus === null)
      .sort((a, b) => (order.get(a.applyUrl) ?? 0) - (order.get(b.applyUrl) ?? 0));
    return { urls: new Set(rows.map((row) => row.applyUrl)), waitingIds: waiting.map((row) => row.id) };
  } catch (error) {
    console.error('[LiveSearch] Could not look up stored hits:', error);
    return { urls: new Set(), waitingIds: [] };
  }
}

/** Read waiting hits now with the request's spare Claude calls (same claims as the worker; capped per request, not by the daily limit). */
export async function readWaitingHits(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  try {
    const { claimed, read } = await enrichRowsNow(ids);
    console.log(`[LiveSearch] Waiting hits from earlier searches: ${read} read, ${claimed - read} not read, ${ids.length - claimed} held elsewhere`);
    return read;
  } catch (error) {
    console.error('[LiveSearch] Could not read waiting hits:', error);
    return 0;
  }
}

/**
 * When the background worker resumes if it has spent today's limit (next UTC
 * midnight), else null. Lets the page say when unread hits will be read.
 */
export async function backgroundChecksResumeAt(now: Date = new Date()): Promise<string | null> {
  try {
    if ((await getTodayEnrichmentCount(prisma, now)) < DAILY_ENRICHMENT_LIMIT) return null;
    const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return nextMidnight.toISOString();
  } catch {
    return null;
  }
}

export interface HitSummary {
  /** Hits stored but not read yet; the worker reads them. */
  waiting: PendingLiveHit[];
  /** Hits read and found closed or not a speaking opportunity. */
  notOpenCount: number;
}

/** State of every hit after the request's reads and inserts. */
export async function summarizeHits(urls: readonly string[]): Promise<HitSummary> {
  if (urls.length === 0) return { waiting: [], notOpenCount: 0 };
  const rows = await prisma.opportunity.findMany({
    where: { applyUrl: { in: [...urls] } },
    select: { title: true, applyUrl: true, source: true, enrichmentStatus: true, isClosed: true, isRelevant: true },
  });
  return {
    waiting: rows
      .filter((row) => row.source === LIVE_SEARCH_SOURCE && row.enrichmentStatus === null)
      .map((row) => ({ title: row.title, applyUrl: row.applyUrl })),
    notOpenCount: rows.filter((row) => row.isClosed || !row.isRelevant).length,
  };
}
