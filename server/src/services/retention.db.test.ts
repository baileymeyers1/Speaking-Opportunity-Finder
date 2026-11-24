import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { MAX_ENRICHMENT_ATTEMPTS } from './enrichmentBudget.js';
import { deadLiveHitsWhere, expiredRowsWhere } from './retention.js';

/**
 * Against the test Postgres database: which rows the daily cleanup would
 * delete. The rules are only read here, narrowed to this file's rows, never
 * run as a delete: other suites' rows sit in the same database.
 *
 * No row here is unread and claimable: the unread one has used its attempts,
 * so the worker tests in enrichmentBudget.db.test.ts cannot take it.
 */
const MARKER = 'retention test row';
const now = new Date('2026-11-24T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const daysAhead = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
const url = (slug: string) => `https://retention.example/${slug}`;

type Row = Parameters<typeof prisma.opportunity.create>[0]['data'];

const listed: Partial<Row> = { enrichmentStatus: 'enriched', verifiedAt: daysAgo(2), isClosed: false, isRelevant: true, hasOpenCall: true };

const ROWS: Record<string, Partial<Row>> = {
  'live-listed-old': { source: 'Live Search', createdAt: daysAgo(40), cfpDeadline: daysAhead(60), ...listed },
  'live-watch-old': { source: 'Live Search', createdAt: daysAgo(40), ...listed, hasOpenCall: false },
  'live-closed-old': { source: 'Live Search', createdAt: daysAgo(40), ...listed, isClosed: true },
  'live-not-an-event-old': { source: 'Live Search', createdAt: daysAgo(40), ...listed, isRelevant: false },
  'live-never-read-old': { source: 'Live Search', createdAt: daysAgo(40), enrichmentStatus: 'skipped', enrichmentAttempts: MAX_ENRICHMENT_ATTEMPTS },
  'live-closed-recent': { source: 'Live Search', createdAt: daysAgo(10), ...listed, isClosed: true },
  'scheduled-closed-old': { source: 'Linkup Search', createdAt: daysAgo(40), ...listed, isClosed: true },
  'live-deadline-passed': { source: 'Live Search', createdAt: daysAgo(10), cfpDeadline: daysAgo(3), ...listed },
  'scraped-deadline-passed': { source: 'test-retention', createdAt: daysAgo(40), cfpDeadline: daysAgo(3), ...listed },
  'scraped-deadline-yesterday': { source: 'test-retention', createdAt: daysAgo(40), cfpDeadline: daysAgo(1), ...listed },
};

beforeAll(async () => {
  await prisma.opportunity.deleteMany({ where: { description: MARKER } });
  await prisma.opportunity.createMany({
    data: Object.entries(ROWS).map(([slug, fields]) => ({
      title: `Retention ${slug}`,
      organization: 'Retention Test Org',
      applyUrl: url(slug),
      format: 'conference',
      source: 'test-retention',
      qualityScore: 50,
      industries: '[]',
      description: MARKER,
      ...fields,
    })),
  });
});

afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { description: MARKER } });
});

async function matching(where: Prisma.OpportunityWhereInput): Promise<string[]> {
  const rows = await prisma.opportunity.findMany({ where: { AND: [where, { description: MARKER }] }, select: { applyUrl: true } });
  return rows.map((row) => row.applyUrl.replace(url(''), '')).sort();
}

describe('retention (db)', () => {
  it('drops live-search dead ends a month after they were found, and keeps what is listed', async () => {
    expect(await matching(deadLiveHitsWhere(now))).toEqual(['live-closed-old', 'live-never-read-old', 'live-not-an-event-old']);
  });

  it('expires every source the same way once its deadline is 36 hours gone, live results included', async () => {
    expect(await matching(expiredRowsWhere(now))).toEqual(['live-deadline-passed', 'scraped-deadline-passed']);
  });
});
