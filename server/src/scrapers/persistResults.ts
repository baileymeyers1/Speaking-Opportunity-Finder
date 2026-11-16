import { prisma } from '../lib/prisma.js';
import { generateDeduplicationKey } from '../services/deduplicationService.js';
import { decodeHtmlEntities, isJunkResult } from '../services/dataNormalization.js';
import { assignEvents, type AssignableOpportunity } from '../services/eventAssignment.js';
import { buildCreateData, buildUpdateData } from './persistData.js';
import { mapWithConcurrency } from './lib/html.js';
import type { ScraperResult } from './qualityScore.js';

/**
 * Refreshes of stored rows run this many at a time. Each write is one round
 * trip to the production database, about 100 ms from the Vercel function, so
 * one row at a time a 200-row source outlasted the 60 s function limit and
 * every daily and weekly sync was killed mid-write (production, 2026-11-16).
 * The `pg` pool holds 10 connections.
 */
const UPDATE_CONCURRENCY = 5;

export interface PersistOptions {
  /** Epoch ms after which no further row is written; the rest waits for the next run. */
  deadline?: number;
  /** Clock for the deadline check (tests). */
  now?: () => number;
}

export interface PersistSummary {
  added: number;
  updated: number;
  /** Rows left unwritten because the deadline passed. */
  deferred: number;
}

function cleanResult(result: ScraperResult): ScraperResult {
  return {
    ...result,
    title: decodeHtmlEntities(result.title),
    organization: decodeHtmlEntities(result.organization),
    description: result.description ? decodeHtmlEntities(result.description) : result.description,
  };
}

/**
 * A result whose URL is not stored yet: merged into a same-event row from
 * another source when one exists (title + organization key), else created.
 */
async function storeNewResult(result: ScraperResult): Promise<{ created?: AssignableOpportunity }> {
  const dedupKey = generateDeduplicationKey(result.title, result.organization);
  const orgPrefix = (result.organization || '').substring(0, 10);

  if (orgPrefix.length > 0) {
    const candidates = await prisma.opportunity.findMany({
      where: { organization: { contains: orgPrefix } },
      select: { id: true, title: true, organization: true, qualityScore: true },
      take: 50,
    });
    const match = candidates.find(
      (candidate) => generateDeduplicationKey(candidate.title, candidate.organization) === dedupKey
    );
    if (match) {
      // Merge into the existing record if the new one has equal or better quality.
      // applyUrl is deliberately left alone so saved links stay stable.
      if (buildCreateData(result).qualityScore >= (match.qualityScore || 0)) {
        const dedupRow = await prisma.opportunity.findUnique({ where: { id: match.id } });
        if (dedupRow) {
          await prisma.opportunity.update({ where: { id: dedupRow.id }, data: buildUpdateData(result, dedupRow) });
        }
      }
      return {};
    }
  }

  return { created: await prisma.opportunity.create({ data: buildCreateData(result) }) };
}

/**
 * Store one scraper's results.
 *
 * Stored rows are looked up in one query, not one per result. New results are
 * written first, one at a time (the cross-source check reads what the previous
 * one wrote), then refreshes of stored rows, a few at a time. Once the
 * deadline passes the rest is counted as deferred and picked up by the next
 * run, so what waits is a refresh of a row we already have. Rows created
 * before the deadline still join their canonical event; a matching failure
 * never loses a row. Re-scrapes refresh scraped fields only (persistData.ts).
 */
export async function persistResults(
  results: ScraperResult[],
  options: PersistOptions = {}
): Promise<PersistSummary> {
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const now = options.now ?? Date.now;
  const kept = results
    .map(cleanResult)
    .filter((result) => !isJunkResult({ title: result.title, description: result.description, applyUrl: result.applyUrl }));

  const stored = kept.length
    ? await prisma.opportunity.findMany({ where: { applyUrl: { in: kept.map((result) => result.applyUrl) } } })
    : [];
  const storedByUrl = new Map(stored.map((row) => [row.applyUrl, row]));

  let added = 0;
  let updated = 0;
  let deferred = 0;
  const createdRows: AssignableOpportunity[] = [];

  for (const result of kept.filter((candidate) => !storedByUrl.has(candidate.applyUrl))) {
    if (now() >= deadline) {
      deferred++;
      continue;
    }
    try {
      const { created } = await storeNewResult(result);
      if (created) {
        createdRows.push(created);
        added++;
      } else {
        updated++;
      }
    } catch (error) {
      console.error(`Error saving opportunity: ${result.title}`, error);
    }
  }

  const refreshes = kept.filter((candidate) => storedByUrl.has(candidate.applyUrl));
  await mapWithConcurrency(refreshes, UPDATE_CONCURRENCY, async (result) => {
    if (now() >= deadline) {
      deferred++;
      return;
    }
    const existing = storedByUrl.get(result.applyUrl)!;
    try {
      await prisma.opportunity.update({ where: { id: existing.id }, data: buildUpdateData(result, existing) });
      updated++;
    } catch (error) {
      console.error(`Error saving opportunity: ${result.title}`, error);
    }
  });

  await assignEvents(prisma, createdRows);

  return { added, updated, deferred };
}
