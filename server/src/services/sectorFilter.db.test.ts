import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { buildFilters } from '../controllers/opportunityFilters.js';
import { getOpportunities, getSectorOptions } from './opportunityService.js';
import { WITHOUT_SECTOR } from './opportunityQuery.js';

/**
 * Against the test Postgres database: the sector filter on the native array
 * column, including rows stored before the column existed (NULL), and the
 * mapping of old free-text `industries` values onto it.
 *
 * Every row here is stored as enriched. An unread row (`enrichmentStatus`
 * null, no claim) in the shared test database is claimable by the worker
 * tests in enrichmentBudget.db.test.ts, which run alongside.
 */
const MARKER = 'sector filter test row';
const SEARCH = 'Sectorprobe';
const now = new Date('2026-11-18T12:00:00Z');
const farDeadline = new Date('2099-01-01T00:00:00Z');
const url = (slug: string) => `https://sector-filter.example/${slug}`;

async function store(slug: string, sectors: string[], industries: string[] = []) {
  return prisma.opportunity.create({
    data: {
      title: `${SEARCH} ${slug}`,
      organization: 'Sector Test Org',
      applyUrl: url(slug),
      format: 'conference',
      source: 'test-sector-filter',
      cfpDeadline: farDeadline,
      qualityScore: 50,
      industries: JSON.stringify(industries),
      sectors,
      description: MARKER,
      enrichmentStatus: 'enriched',
      verifiedAt: now,
    },
  });
}

async function reset() {
  await prisma.opportunity.deleteMany({ where: { description: { contains: MARKER } } });
}

async function titles(query: Record<string, unknown>) {
  const page = await getOpportunities({ ...buildFilters(query), search: SEARCH }, { page: 1, pageSize: 50 }, { now });
  return page.items.map((item) => item.title.replace(`${SEARCH} `, '')).sort();
}

describe('the sector filter', () => {
  beforeAll(async () => {
    await reset();
    await store('nursing', ['healthcare'], ['nursing']);
    await store('ai-health', ['ai', 'healthcare'], ['ai', 'digital health']);
    await store('kube', ['cloud-devops'], ['kubernetes']);
    // Tagged "ai" in free text, but its sector says finance: the filter goes by the sector.
    await store('fintech', ['finance'], ['ai', 'fintech']);
    await store('empty', []);
    // A row from before the column existed: Prisma cannot write NULL, production holds it.
    const legacy = await store('legacy-null', ['legal']);
    await prisma.$executeRaw`UPDATE "Opportunity" SET "sectors" = NULL WHERE id = ${legacy.id}`;
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it('lists the rows that carry the sector, as first or second', async () => {
    expect(await titles({ sectors: 'healthcare' })).toEqual(['ai-health', 'nursing']);
    expect(await titles({ sectors: 'cloud-devops' })).toEqual(['kube']);
  });

  it('matches any of several sectors', async () => {
    expect(await titles({ sectors: ['healthcare', 'cloud-devops'] })).toEqual(['ai-health', 'kube', 'nursing']);
  });

  it('goes by the sector, not by a free-text tag of the same name', async () => {
    expect(await titles({ sectors: 'ai' })).toEqual(['ai-health']);
  });

  it('lists every row when no sector is asked for, sectorless rows included', async () => {
    expect(await titles({})).toEqual(['ai-health', 'empty', 'fintech', 'kube', 'legacy-null', 'nursing']);
  });

  it('never matches a row without a sector, NULL or empty', async () => {
    const withSector = await titles({ sectors: ['healthcare', 'ai', 'cloud-devops', 'finance', 'legal'] });
    expect(withSector).not.toContain('empty');
    expect(withSector).not.toContain('legacy-null');
  });

  it('maps an old industries link to the sector it meant', async () => {
    expect(await titles({ industries: 'kubernetes' })).toEqual(['kube']);
    expect(await titles({ industries: ['artificial intelligence'] })).toEqual(['ai-health']);
  });

  it('returns sectors on each row, an empty list for a row that has none', async () => {
    const page = await getOpportunities({ search: SEARCH }, { page: 1, pageSize: 50 }, { now });
    const byTitle = new Map(page.items.map((item) => [item.title.replace(`${SEARCH} `, ''), item.sectors]));
    expect(byTitle.get('ai-health')).toEqual(['ai', 'healthcare']);
    expect(byTitle.get('empty')).toEqual([]);
    expect(byTitle.get('legacy-null')).toEqual([]);
  });

  it('finds rows without a sector, however "none" is stored', async () => {
    const rows = await prisma.opportunity.findMany({
      where: { AND: [WITHOUT_SECTOR, { description: { contains: MARKER } }] },
      select: { applyUrl: true },
    });
    expect(rows.map((row) => row.applyUrl).sort()).toEqual([url('empty'), url('legacy-null')]);
  });

  it('offers every sector with its number of listed cards', async () => {
    const options = await getSectorOptions();
    expect(options).toHaveLength(34);
    expect(options[0]).toMatchObject({ id: 'ai', label: 'AI & Machine Learning' });
    // Other suites may hold rows too: these are lower bounds from this suite's own rows.
    const count = (id: string) => options.find((option) => option.id === id)!.count;
    expect(count('healthcare')).toBeGreaterThanOrEqual(2);
    expect(count('finance')).toBeGreaterThanOrEqual(1);
  });
});
