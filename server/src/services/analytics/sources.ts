import { prisma } from '../../lib/prisma.js';
import { SCRAPERS } from '../../scrapers/index.js';
import { startOfUtcDay } from '../../scrapers/lib/html.js';
import type {
  AdminRunStatus,
  AdminScraperRun,
  AdminSourceHealth,
  AdminSourceRowCounts,
  AdminSourceStatus,
  AdminSourcesResponse,
  ScraperCadence,
} from 'shared';
import { daysAgo } from './shared.js';

/**
 * Per-source health: what each scraper's recent runs look like and what its
 * rows are worth. A source is judged on its run history, not on row counts,
 * so a scraper that silently returns nothing is visible after its next run.
 */

export const SPARKLINE_DAYS = 14;
/** Runs to look back for the consecutive-empty count; weekly sources need several weeks. */
const RUN_HISTORY_DAYS = 60;
export const FAILING_AFTER_EMPTY_RUNS = 3;

/** `Opportunity.source` values that do not equal a scraper's registry name. */
const SOURCE_ALIASES: Record<string, string> = {
  linkup: 'Linkup Search',
};
/** Sources that are filled by user actions rather than a scheduled scraper. */
const MANUAL_SOURCES = new Set(['Live Search']);

export interface ScraperRunRow {
  id: string;
  scraper: string;
  cadence: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  found: number;
  added: number;
  updated: number;
  error: string | null;
}

export interface RegistryEntry {
  name: string;
  cadence: ScraperCadence;
}

function runStatus(status: string): AdminRunStatus {
  return status === 'ok' || status === 'error' ? status : 'running';
}

export function toAdminRun(run: ScraperRunRow): AdminScraperRun {
  return {
    id: run.id,
    scraper: run.scraper,
    cadence: run.cadence,
    status: runStatus(run.status),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
    found: run.found,
    added: run.added,
    updated: run.updated,
    error: run.error,
  };
}

/** Finished runs, newest first, that errored or found nothing, up to the last productive run. */
export function countConsecutiveEmptyRuns(runsNewestFirst: ScraperRunRow[]): number {
  let count = 0;
  for (const run of runsNewestFirst) {
    if (run.status === 'running') continue;
    if (run.status === 'error' || run.found === 0) {
      count++;
      continue;
    }
    break;
  }
  return count;
}

export function sourceStatus(input: {
  registered: boolean;
  manual: boolean;
  lastRun: ScraperRunRow | null;
  consecutiveEmptyRuns: number;
}): AdminSourceStatus {
  if (input.manual) return 'manual';
  if (!input.registered) return 'retired';
  if (!input.lastRun) return 'never-run';
  if (input.consecutiveEmptyRuns >= FAILING_AFTER_EMPTY_RUNS) return 'failing';
  if (input.consecutiveEmptyRuns > 0) return 'warning';
  return 'healthy';
}

export function emptyRowCounts(): AdminSourceRowCounts {
  return { total: 0, active: 0, enriched: 0, verified: 0, closed: 0 };
}

export interface SummarizeSourcesInput {
  registry: RegistryEntry[];
  /** Any order; grouped and sorted here. */
  runs: ScraperRunRow[];
  /** Keyed by `Opportunity.source`. */
  rowCounts: Map<string, AdminSourceRowCounts>;
  now: Date;
}

/** Pure aggregation over registry, run rows and per-source row counts. */
export function summarizeSources({ registry, runs, rowCounts, now }: SummarizeSourcesInput): AdminSourceHealth[] {
  const sparklineSince = daysAgo(SPARKLINE_DAYS, now).getTime();
  const runsByScraper = new Map<string, ScraperRunRow[]>();
  for (const run of runs) {
    const list = runsByScraper.get(run.scraper) ?? [];
    list.push(run);
    runsByScraper.set(run.scraper, list);
  }
  for (const list of runsByScraper.values()) {
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  const registered = new Map(registry.map((entry) => [entry.name, entry.cadence]));
  const sourceToScraper = new Map<string, string>();
  for (const [scraper, source] of Object.entries(SOURCE_ALIASES)) sourceToScraper.set(source, scraper);

  const names = new Set<string>(registry.map((entry) => entry.name));
  for (const scraper of runsByScraper.keys()) names.add(scraper);
  for (const source of rowCounts.keys()) names.add(sourceToScraper.get(source) ?? source);

  const summaries = [...names].map((name): AdminSourceHealth => {
    const scraperRuns = runsByScraper.get(name) ?? [];
    const lastRun = scraperRuns[0] ?? null;
    const consecutiveEmptyRuns = countConsecutiveEmptyRuns(scraperRuns);
    const isRegistered = registered.has(name);
    const rows = rowCounts.get(SOURCE_ALIASES[name] ?? name) ?? emptyRowCounts();
    return {
      name,
      cadence: registered.get(name) ?? null,
      registered: isRegistered,
      status: sourceStatus({ registered: isRegistered, manual: MANUAL_SOURCES.has(name), lastRun, consecutiveEmptyRuns }),
      lastRun: lastRun ? toAdminRun(lastRun) : null,
      consecutiveEmptyRuns,
      sparkline: scraperRuns
        .filter((run) => run.startedAt.getTime() >= sparklineSince && run.status !== 'running')
        .reverse()
        .map((run) => ({ startedAt: run.startedAt.toISOString(), found: run.found, status: runStatus(run.status) })),
      rows,
    };
  });

  // Registry order first (that is the order syncs are configured in), then everything else by name.
  const registryIndex = new Map(registry.map((entry, index) => [entry.name, index]));
  return summaries.sort((a, b) => {
    const ia = registryIndex.get(a.name) ?? Number.POSITIVE_INFINITY;
    const ib = registryIndex.get(b.name) ?? Number.POSITIVE_INFINITY;
    return ia - ib || a.name.localeCompare(b.name);
  });
}

async function countRowsBySource(now: Date): Promise<Map<string, AdminSourceRowCounts>> {
  const today = startOfUtcDay(now);
  const [total, active, enriched, verified, closed] = await Promise.all([
    prisma.opportunity.groupBy({ by: ['source'], _count: { id: true } }),
    prisma.opportunity.groupBy({
      by: ['source'],
      _count: { id: true },
      where: { isClosed: false, isRelevant: true, OR: [{ cfpDeadline: { gte: today } }, { cfpDeadline: null }] },
    }),
    prisma.opportunity.groupBy({ by: ['source'], _count: { id: true }, where: { enrichmentStatus: 'enriched' } }),
    prisma.opportunity.groupBy({ by: ['source'], _count: { id: true }, where: { verifiedAt: { not: null } } }),
    prisma.opportunity.groupBy({ by: ['source'], _count: { id: true }, where: { isClosed: true } }),
  ]);

  const counts = new Map<string, AdminSourceRowCounts>();
  const fill = (groups: Array<{ source: string; _count: { id: number } }>, key: keyof AdminSourceRowCounts) => {
    for (const group of groups) {
      const entry = counts.get(group.source) ?? emptyRowCounts();
      entry[key] = group._count.id;
      counts.set(group.source, entry);
    }
  };
  fill(total, 'total');
  fill(active, 'active');
  fill(enriched, 'enriched');
  fill(verified, 'verified');
  fill(closed, 'closed');
  return counts;
}

export async function getSources(now: Date = new Date()): Promise<AdminSourcesResponse> {
  const [recentRuns, latestRuns, rowCounts] = await Promise.all([
    prisma.scraperRun.findMany({
      where: { startedAt: { gte: daysAgo(RUN_HISTORY_DAYS, now) } },
      orderBy: { startedAt: 'desc' },
      take: 2000,
    }),
    // The latest run per scraper, however old, so a long-idle source still shows when it last ran.
    prisma.scraperRun.findMany({ distinct: ['scraper'], orderBy: { startedAt: 'desc' } }),
    countRowsBySource(now),
  ]);

  const runs = new Map<string, ScraperRunRow>();
  for (const run of [...recentRuns, ...latestRuns]) runs.set(run.id, run);

  return {
    sources: summarizeSources({
      registry: SCRAPERS.map((scraper) => ({ name: scraper.name, cadence: scraper.cadence })),
      runs: [...runs.values()],
      rowCounts,
      now,
    }),
    generatedAt: now.toISOString(),
  };
}
