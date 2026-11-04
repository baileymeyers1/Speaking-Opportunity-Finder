import { test, expect, type Page } from '@playwright/test';

/**
 * The admin dashboard with every admin endpoint mocked: the attention strip
 * lists exactly the conditions that need action, each section renders from
 * its own endpoint, and a manual action reports its result inline.
 */

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  isAdmin: true,
  preferredIndustries: [],
  createdAt: ago(30 * 24 * HOUR),
};

function run(scraper: string, msAgo: number, found: number, status: 'ok' | 'error' = 'ok') {
  return {
    id: `${scraper}-${msAgo}`,
    scraper,
    cadence: 'daily',
    status,
    startedAt: ago(msAgo),
    finishedAt: ago(msAgo - 5000),
    durationMs: 5000,
    found,
    added: Math.min(found, 2),
    updated: Math.max(0, found - 2),
    error: status === 'error' ? `${scraper} timed out after 45s` : null,
  };
}

const sources = {
  sources: [
    {
      name: 'confs.tech',
      cadence: 'daily',
      registered: true,
      status: 'healthy',
      lastRun: run('confs.tech', 6 * HOUR, 19),
      consecutiveEmptyRuns: 0,
      sparkline: [
        { startedAt: ago(30 * HOUR), found: 17, status: 'ok' },
        { startedAt: ago(6 * HOUR), found: 19, status: 'ok' },
      ],
      rows: { total: 40, active: 31, enriched: 20, verified: 12, closed: 3 },
    },
    {
      name: 'wikicfp.com',
      cadence: 'weekly',
      registered: true,
      status: 'failing',
      lastRun: run('wikicfp.com', 6 * HOUR, 0, 'error'),
      consecutiveEmptyRuns: 3,
      sparkline: [{ startedAt: ago(6 * HOUR), found: 0, status: 'error' }],
      rows: { total: 88, active: 60, enriched: 0, verified: 0, closed: 0 },
    },
    {
      name: 'javaconferences.org',
      cadence: 'daily',
      registered: true,
      status: 'warning',
      lastRun: run('javaconferences.org', 6 * HOUR, 0),
      consecutiveEmptyRuns: 1,
      sparkline: [{ startedAt: ago(6 * HOUR), found: 0, status: 'ok' }],
      rows: { total: 8, active: 8, enriched: 0, verified: 0, closed: 0 },
    },
    {
      name: 'papercall.io',
      cadence: null,
      registered: false,
      status: 'retired',
      lastRun: run('papercall.io', 20 * 24 * HOUR, 0),
      consecutiveEmptyRuns: 5,
      sparkline: [],
      rows: { total: 5, active: 0, enriched: 0, verified: 0, closed: 5 },
    },
  ],
  generatedAt: ago(0),
};

const pipeline = {
  enrichment: { backlog: 12, claimed: 1, staleClaims: 2, failed: 1, enrichedLast24h: 40, lastEnrichedAt: ago(4 * 60 * 1000) },
  budget: { date: '2026-11-03', used: 200, limit: 200 },
  verification: { due: 3, dueDeadlineSoon: 1, dueStale: 2, withError: 0, lowConfidenceDates: 4, verifiedLast24h: 9, lastVerifiedAt: ago(10 * 60 * 1000) },
  crons: { dailySyncAt: ago(30 * HOUR), weeklySyncAt: ago(2 * 24 * HOUR), enrichmentAt: ago(4 * 60 * 1000), enrichmentHasWork: true },
  events: [
    { at: ago(4 * 60 * 1000), kind: 'enrichment', status: 'ok', summary: 'Enriched "DevConf 2027"', detail: null },
    { at: ago(6 * HOUR), kind: 'scraper-run', status: 'error', summary: 'wikicfp.com: run failed', detail: 'wikicfp.com timed out after 45s' },
  ],
  generatedAt: ago(0),
};

const catalogue = {
  totals: { all: 374, active: 300, closed: 20, irrelevant: 4, expired: 50 },
  byFormat: [
    { label: 'conference', count: 280 },
    { label: 'podcast', count: 20 },
  ],
  byIndustry: [
    { label: 'technology', count: 200 },
    { label: 'healthcare', count: 30 },
  ],
  byDeadline: { within7Days: 20, within30Days: 100, within90Days: 90, later: 60, noDeadline: 30 },
  closedThisWeek: 5,
  remote: 60,
  inPerson: 240,
  events: {
    events: 280,
    linkedRows: 318,
    unlinkedRows: 2,
    rowsPerEvent: 1.1,
    multiSourceEvents: 24,
    multiYearEvents: 3,
    thresholds: { autoLink: 0.8, review: 0.55 },
    possibleDuplicates: [
      {
        opportunityId: 'opp-asia',
        title: 'React Summit Asia',
        source: 'confs.tech',
        eventDate: '2027-04-15T00:00:00.000Z',
        ownEvent: 'React Summit Asia',
        possibleEventId: 'event-react-summit',
        possibleEvent: 'React Summit',
        score: 0.645,
      },
    ],
  },
  generatedAt: ago(0),
};

const demand = {
  savedSearches: {
    total: 6,
    users: 3,
    createdLast7d: 2,
    withQuery: 4,
    remoteOnly: 1,
    topQueries: [{ label: 'kubernetes', count: 2 }],
    topIndustries: [{ label: 'technology', count: 5 }],
    topLocations: [],
    topFormats: [{ label: 'conference', count: 3 }],
  },
  searchLog: {
    total7d: 12,
    total30d: 40,
    distinctQueries30d: 9,
    topQueries: [{ query: 'devops conference', count: 7, averageResults: 11, lastSearchedAt: ago(HOUR) }],
  },
  generatedAt: ago(0),
};

async function mockAdminApi(page: Page, overrides: { pipeline?: typeof pipeline; sources?: typeof sources } = {}) {
  const sections: Record<string, unknown> = {
    sources: overrides.sources ?? sources,
    pipeline: overrides.pipeline ?? pipeline,
    catalogue,
    demand,
  };
  await page.route((url) => url.pathname === '/api/auth/me', (route) => route.fulfill({ json: { success: true, data: adminUser } }));
  await page.route((url) => url.pathname === '/api/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.route(
    (url) => url.pathname.startsWith('/api/admin/analytics/'),
    (route) => {
      const section = new URL(route.request().url()).pathname.split('/').pop() ?? '';
      return route.fulfill({ json: { success: true, data: sections[section] } });
    }
  );
}

test('the attention strip lists the failing source, exhausted budget, stale claims and the overdue daily sync', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/admin/dashboard');

  const strip = page.getByRole('region', { name: 'Needs attention' });
  await expect(strip.getByRole('heading')).toHaveText('Needs attention: 4 critical, 1 warning');

  const items = strip.getByRole('listitem');
  await expect(items).toHaveCount(5);
  await expect(items.nth(0)).toContainText('wikicfp.com is failing');
  await expect(items.nth(0)).toContainText('3 runs in a row');
  await expect(items.nth(1)).toContainText('Claude budget exhausted');
  await expect(items.nth(2)).toContainText('2 stale enrichment claims');
  await expect(items.nth(3)).toContainText('Daily sync has not run');
  await expect(items.nth(3)).toContainText('30h ago');
  await expect(items.nth(4)).toContainText('javaconferences.org returned nothing');

  // Critical before warning, and nothing for the healthy, retired or current conditions.
  await expect(items.nth(0)).toHaveAttribute('data-severity', 'critical');
  await expect(items.nth(4)).toHaveAttribute('data-severity', 'warning');
  await expect(strip).not.toContainText('confs.tech');
  await expect(strip).not.toContainText('papercall.io');
  await expect(strip).not.toContainText('Weekly sync');
  await expect(strip).not.toContainText('Enrichment cron');

  // Each item links to its section.
  await expect(items.nth(0).getByRole('link')).toHaveAttribute('href', '#sources');
  await expect(items.nth(1).getByRole('link')).toHaveAttribute('href', '#pipeline');
});

test('sections render from their own endpoints with accessible status text', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/admin/dashboard');

  const sourcesTable = page.getByRole('region', { name: 'Sources' }).getByRole('table');
  await expect(sourcesTable.getByRole('row')).toHaveCount(5);
  const wikicfpRow = sourcesTable.getByRole('row', { name: /wikicfp\.com/ });
  await expect(wikicfpRow).toContainText('Failing');
  await expect(wikicfpRow).toContainText('Error');
  await expect(wikicfpRow.getByRole('img')).toHaveAccessibleName(/wikicfp\.com, rows found per run over 14 days, oldest first: error/);
  const papercallRow = sourcesTable.getByRole('row', { name: /papercall\.io/ });
  await expect(papercallRow).toContainText('Retired');
  await expect(papercallRow.getByRole('button')).toHaveCount(0);

  const pipelineSection = page.getByRole('region', { name: 'Pipeline' });
  await expect(pipelineSection.getByRole('progressbar', { name: 'Claude calls used today' })).toHaveAttribute('aria-valuenow', '200');
  await expect(pipelineSection).toContainText('Exhausted');
  await expect(pipelineSection.getByRole('list', { name: 'Recent pipeline events' }).getByRole('listitem')).toHaveCount(2);

  await expect(page.getByRole('region', { name: 'Catalogue' })).toContainText('Closing within 7 days');
  await expect(page.getByRole('region', { name: 'Demand' })).toContainText('devops conference (avg 11 results)');
});

test('the strip reads all clear when nothing needs attention', async ({ page }) => {
  await mockAdminApi(page, {
    sources: { ...sources, sources: sources.sources.filter((s) => s.status === 'healthy' || s.status === 'retired') },
    pipeline: {
      ...pipeline,
      enrichment: { ...pipeline.enrichment, staleClaims: 0 },
      budget: { ...pipeline.budget, used: 40 },
      crons: { ...pipeline.crons, dailySyncAt: ago(6 * HOUR) },
    },
  });
  await page.goto('/admin/dashboard');
  await expect(page.getByRole('region', { name: 'Needs attention' })).toContainText('All clear.');
});

test('running a scraper reports the result inline', async ({ page }) => {
  await mockAdminApi(page);
  await page.route(
    (url) => url.pathname === '/api/sync',
    (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            runs: [{ scraper: 'confs.tech', status: 'ok', found: 21, added: 2, updated: 19, durationMs: 4800 }],
            skipped: [],
            durationMs: 5000,
          },
        },
      })
  );
  await page.goto('/admin/dashboard');
  await page.getByRole('button', { name: 'Run confs.tech now' }).click();
  await expect(page.getByRole('region', { name: 'Sources' })).toContainText('confs.tech: 21 found, 2 added, 19 updated in 4.8s');
});
