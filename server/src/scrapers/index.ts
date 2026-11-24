import { prisma } from '../lib/prisma.js';
import { type Prisma } from '../generated/prisma/client.js';
import { scrapeConfsTech } from './confstech.js';
import { scrapeJavaConferences } from './javaconferences.js';
import { scrapeCallingAllPapers } from './callingallpapers.js';
import { scrapeLinkupCFPs } from './linkupcfp.js';
import { LINKUP_QUERY_COUNT } from './linkupQueries.js';
import { scrapePretalx } from './pretalx.js';
import { scrapeSessionize } from './sessionize.js';
import { scrapeWikiCFP } from './wikicfp.js';
import { scrapeConferenceAlertsUSA } from './conferenceAlerts.js';
import { scrapeDevelopersEvents } from './developersEvents.js';
import { scrapeRuralHealthInfo } from './ruralHealthInfo.js';
import { scrapeRadioGuestList } from './radioGuestList.js';
import { config } from '../config/index.js';
import { promotedLinkupQueries } from '../services/searchLog.js';
import { computeQualityScore, type ScraperResult } from './qualityScore.js';
import { persistResults } from './persistResults.js';
import { deadLiveHitsWhere, expiredRowsWhere } from '../services/retention.js';

export { computeQualityScore } from './qualityScore.js';
export type { ScraperResult } from './qualityScore.js';

async function backfillQualityScores(): Promise<number> {
  const batchSize = 200;
  let updated = 0;

  while (true) {
    const batch = await prisma.opportunity.findMany({
      where: { qualityScore: null },
      take: batchSize,
    });

    if (batch.length === 0) break;

    for (const opp of batch) {
      const computed = computeQualityScore({
        title: opp.title,
        organization: opp.organization,
        description: opp.description || undefined,
        location: opp.location,
        isRemote: opp.isRemote,
        eventDate: opp.eventDate || undefined,
        cfpDeadline: opp.cfpDeadline || undefined,
        format: opp.format,
        industries: (() => {
          try {
            return JSON.parse(opp.industries) as string[];
          } catch {
            return [];
          }
        })(),
        compensationType: opp.compensationType || undefined,
        compensationAmount: opp.compensationAmount || undefined,
        compensationDetails: opp.compensationDetails || undefined,
        applyUrl: opp.applyUrl,
        source: opp.source,
        sourceUrl: opp.sourceUrl || undefined,
      });

      await prisma.opportunity.update({
        where: { id: opp.id },
        data: { qualityScore: computed },
      });
      updated++;
    }
  }

  return updated;
}

/**
 * Recompute quality scores. Pass a `where` to limit the pass (e.g. rows
 * touched by this sync) instead of scanning the whole table every run.
 */
export async function recalculateQualityScores(where: Prisma.OpportunityWhereInput = {}): Promise<number> {
  const batchSize = 200;
  let updated = 0;
  let skip = 0;

  while (true) {
    const batch = await prisma.opportunity.findMany({
      where,
      orderBy: { id: 'asc' },
      take: batchSize,
      skip,
    });

    if (batch.length === 0) break;

    for (const opp of batch) {
      const result: ScraperResult = {
        title: opp.title,
        organization: opp.organization,
        description: opp.description || undefined,
        location: opp.location || undefined,
        isRemote: opp.isRemote,
        eventDate: opp.eventDate ? new Date(opp.eventDate) : undefined,
        cfpDeadline: opp.cfpDeadline ? new Date(opp.cfpDeadline) : undefined,
        format: opp.format,
        industries: (() => { try { return JSON.parse(opp.industries || '[]'); } catch { return []; } })(),
        compensationType: opp.compensationType || undefined,
        compensationAmount: opp.compensationAmount || undefined,
        applyUrl: opp.applyUrl,
        source: opp.source,
        isClosed: opp.isClosed,
        isRelevant: opp.isRelevant,
      };

      const newScore = computeQualityScore(result);
      if (newScore !== opp.qualityScore) {
        await prisma.opportunity.update({
          where: { id: opp.id },
          data: { qualityScore: newScore },
        });
        updated++;
      }
    }

    skip += batchSize;
  }

  return updated;
}

/** Full-table recalculation (admin/maintenance use). */
export async function recalculateAllQualityScores(): Promise<number> {
  const updated = await recalculateQualityScores();
  console.log(`Recalculated quality scores: ${updated} records updated`);
  return updated;
}

const TRACKING_PARAM_PATTERN = /^(utm_\w+|ref|ref_src|fbclid|gclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|source)$/i;

/**
 * Canonical form of a URL for de-duplication. Drops www, trailing slash, hash
 * and tracking parameters, lowercases the host, and sorts the remaining query
 * parameters. Identifying parameters are kept: WikiCFP, for example, addresses
 * every event through `event.showcfp?eventid=…`.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, '').toLowerCase();
    const pathname = u.pathname.replace(/\/$/, '');
    const params = [...u.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAM_PATTERN.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : '';
    return `${u.protocol}//${host}${pathname}${query}`;
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

function deduplicateResults(results: ScraperResult[]): ScraperResult[] {
  const seen = new Set<string>();
  const deduped: ScraperResult[] = [];

  for (const result of results) {
    const key = normalizeUrl(result.applyUrl);
    if (!seen.has(key)) {
      deduped.push(result);
      seen.add(key);
    }
  }

  return deduped;
}

export type ScraperCadence = 'daily' | 'weekly';

export interface ScraperDefinition {
  /** Stable name recorded in ScraperRun. Prefer the source domain. */
  name: string;
  cadence: ScraperCadence;
  run: () => Promise<ScraperResult[]>;
}

const LINKUP_QUERIES_PER_RUN = 6;
/** Frequent live-search queries appended to each daily Linkup run (see services/searchLog.ts). */
const PROMOTED_LINKUP_QUERIES_PER_RUN = 2;

/**
 * Linkup has ~90 paid queries that take a few seconds each. Each run takes a
 * deterministic, date-rotating slice so that successive daily runs cover the
 * whole list without exceeding the serverless time budget.
 */
export function rotatingLinkupSlice(now: Date = new Date()) {
  const day = Math.floor(now.getTime() / 86_400_000);
  return {
    offset: (day * LINKUP_QUERIES_PER_RUN) % LINKUP_QUERY_COUNT,
    maxQueries: LINKUP_QUERIES_PER_RUN,
  };
}

export const SCRAPERS: ScraperDefinition[] = [
  { name: 'confs.tech', cadence: 'daily', run: scrapeConfsTech },
  { name: 'javaconferences.org', cadence: 'daily', run: scrapeJavaConferences },
  { name: 'callingallpapers.com', cadence: 'daily', run: scrapeCallingAllPapers },
  { name: 'developers.events', cadence: 'daily', run: scrapeDevelopersEvents },
  { name: 'pretalx.com', cadence: 'daily', run: scrapePretalx },
  { name: 'sessionize.com', cadence: 'daily', run: scrapeSessionize },
  // Two or three listing pages and one feed: about a second each, no per-row page fetches.
  { name: 'ruralhealthinfo.org', cadence: 'daily', run: scrapeRuralHealthInfo },
  { name: 'radioguestlist.com', cadence: 'daily', run: scrapeRadioGuestList },
  {
    name: 'linkup',
    cadence: 'daily',
    run: async () =>
      scrapeLinkupCFPs(config.scrapers?.webSearch, {
        ...rotatingLinkupSlice(),
        extraQueries: await promotedLinkupQueries(PROMOTED_LINKUP_QUERIES_PER_RUN),
      }),
  },
  { name: 'wikicfp.com', cadence: 'weekly', run: scrapeWikiCFP },
  { name: 'conferencealerts.com', cadence: 'weekly', run: scrapeConferenceAlertsUSA },
];

export interface ScraperRunSummary {
  scraper: string;
  status: 'ok' | 'error';
  found: number;
  added: number;
  updated: number;
  /** Results not written before the scraper's deadline; the next run writes them. */
  deferred: number;
  durationMs: number;
  error?: string;
}

class ScraperTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`${name} timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = 'ScraperTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ScraperTimeoutError(name, timeoutMs)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

/**
 * Run one scraper, persist its results immediately, and record the run.
 * `timeoutMs` bounds the whole run, fetching and writing: the fetch is cut off
 * at it, and writing stops at it (what is left waits for the next run), so a
 * run never outlasts the function. A failure or timeout in one scraper never
 * loses another scraper's rows.
 */
export async function runScraper(def: ScraperDefinition, timeoutMs: number): Promise<ScraperRunSummary> {
  const startedAt = new Date();
  const deadline = startedAt.getTime() + timeoutMs;
  const run = await prisma.scraperRun.create({
    data: { scraper: def.name, cadence: def.cadence, status: 'running', startedAt },
  });

  try {
    const results = deduplicateResults(await withTimeout(def.run(), timeoutMs, def.name));
    const { added, updated, deferred } = await persistResults(results, { deadline });
    const finishedAt = new Date();
    await prisma.scraperRun.update({
      where: { id: run.id },
      data: { status: 'ok', finishedAt, found: results.length, added, updated },
    });
    const summary: ScraperRunSummary = {
      scraper: def.name, status: 'ok', found: results.length, added, updated, deferred,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
    const deferredNote = deferred > 0 ? `, ${deferred} left for the next run (time budget)` : '';
    console.log(
      `[Sync] ${def.name}: ${results.length} found, ${added} added, ${updated} updated${deferredNote} (${summary.durationMs}ms)`
    );
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();
    await prisma.scraperRun.update({
      where: { id: run.id },
      data: { status: 'error', finishedAt, error: message.slice(0, 1000) },
    });
    console.error(`[Sync] ${def.name} failed: ${message}`);
    return {
      scraper: def.name, status: 'error', found: 0, added: 0, updated: 0, deferred: 0,
      durationMs: finishedAt.getTime() - startedAt.getTime(), error: message,
    };
  }
}

/** Least recently run first, never-run scrapers before all others. */
async function orderByLeastRecentlyRun(defs: ScraperDefinition[]): Promise<ScraperDefinition[]> {
  const lastRuns = await prisma.scraperRun.groupBy({
    by: ['scraper'],
    _max: { startedAt: true },
    where: { scraper: { in: defs.map((d) => d.name) } },
  });
  const lastRunAt = new Map(lastRuns.map((r) => [r.scraper, r._max.startedAt?.getTime() ?? 0]));
  return [...defs].sort((a, b) => (lastRunAt.get(a.name) ?? 0) - (lastRunAt.get(b.name) ?? 0));
}

/** Deletes what `services/retention.ts` says has run its course; saved rows never. */
async function cleanupExpired(): Promise<number> {
  const now = new Date();
  const expired = await prisma.opportunity.deleteMany({ where: expiredRowsWhere(now) });
  const deadLiveHits = await prisma.opportunity.deleteMany({ where: deadLiveHitsWhere(now) });
  console.log(`[Cleanup] Removed ${expired.count} expired + ${deadLiveHits.count} live-search dead ends`);
  return expired.count + deadLiveHits.count;
}

async function cleanupPlaceholderData(): Promise<number> {
  const deleted = await prisma.opportunity.deleteMany({
    where: {
      applyUrl: {
        contains: 'example.com',
      },
    },
  });
  if (deleted.count > 0) {
    console.log(`Cleaned up ${deleted.count} placeholder records with example.com URLs`);
  }
  return deleted.count;
}

export interface SyncOptions {
  /** Wall-clock budget for the whole run. Scrapers that don't fit are skipped (and run first next time). */
  timeBudgetMs?: number;
  /** Restrict to these scraper names. */
  only?: string[];
}

export interface SyncSummary {
  added: number;
  updated: number;
  total: number;
  mode: string;
  runs: ScraperRunSummary[];
  skipped: string[];
  deleted: number;
  recalculated: number;
  durationMs: number;
}

const PER_SCRAPER_TIMEOUT_MS = 45_000;
/** Don't start a scraper with less than this left; leave room for cleanup. */
const MIN_REMAINING_MS = 8_000;

/**
 * Sync opportunities to the database.
 * @param mode - 'daily' runs the fast structured sources, 'weekly' the slow ones, 'full' everything
 */
export async function syncOpportunities(
  mode: 'daily' | 'weekly' | 'full' = 'full',
  options: SyncOptions = {}
): Promise<SyncSummary> {
  const startedAt = new Date();
  const budget = options.timeBudgetMs ?? Number.POSITIVE_INFINITY;
  console.log(`Starting ${mode} opportunity sync${Number.isFinite(budget) ? ` (budget ${Math.round(budget / 1000)}s)` : ''}...`);

  await cleanupPlaceholderData();

  let defs = mode === 'full' ? SCRAPERS : SCRAPERS.filter((d) => d.cadence === mode);
  if (options.only?.length) {
    const wanted = new Set(options.only);
    defs = defs.filter((d) => wanted.has(d.name));
  }
  defs = await orderByLeastRecentlyRun(defs);

  const runs: ScraperRunSummary[] = [];
  const skipped: string[] = [];
  for (const def of defs) {
    const remaining = budget - (Date.now() - startedAt.getTime());
    if (remaining < MIN_REMAINING_MS) {
      skipped.push(def.name);
      continue;
    }
    runs.push(await runScraper(def, Math.min(PER_SCRAPER_TIMEOUT_MS, remaining - MIN_REMAINING_MS / 2)));
  }

  const deleted = await cleanupExpired();
  const backfilled = await backfillQualityScores();
  // Only rows this run touched; the full-table pass is an admin operation.
  const recalculated = backfilled + (await recalculateQualityScores({ updatedAt: { gte: startedAt } }));

  const added = runs.reduce((n, r) => n + r.added, 0);
  const updated = runs.reduce((n, r) => n + r.updated, 0);
  const total = await prisma.opportunity.count();
  const durationMs = Date.now() - startedAt.getTime();

  console.log(
    `Sync complete (${mode}): ${runs.length} scrapers ran, ${skipped.length} skipped, ${added} added, ${updated} updated, ${deleted} expired removed, ${recalculated} rescored, ${durationMs}ms`
  );
  if (skipped.length) console.log(`[Sync] Skipped for time budget: ${skipped.join(', ')}`);

  return { added, updated, total, mode, runs, skipped, deleted, recalculated, durationMs };
}
