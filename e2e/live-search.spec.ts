import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * The home page's data flow, with the opportunities API mocked:
 * a live search merges into the list, a detail round trip restores the exact
 * prior list without refetching, and changing a filter refetches even while
 * live results are showing.
 */

const baseItem = {
  description: 'Talks wanted.',
  location: 'Portland, OR',
  isRemote: false,
  eventDate: '2027-03-10T00:00:00.000Z',
  cfpDeadline: '2026-12-31T00:00:00.000Z',
  format: 'conference',
  industries: ['technology'],
  compensationType: null,
  compensationAmount: null,
  compensationDetails: null,
  qualityScore: 60,
  source: 'test',
  sourceUrl: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const storedItem = {
  ...baseItem,
  id: 'db-1',
  title: 'Stored KubeCon Talk Call',
  organization: 'Stored Org',
  applyUrl: 'https://example.com/stored',
};

const remoteItem = {
  ...baseItem,
  id: 'db-2',
  title: 'Remote Kubernetes Webinar',
  organization: 'Remote Org',
  isRemote: true,
  applyUrl: 'https://example.com/remote',
};

const liveItem = {
  ...baseItem,
  id: 'live-abc',
  title: 'Live Found Kube Summit',
  organization: 'Live Org',
  applyUrl: 'https://example.com/live',
  isLiveResult: true,
  liveSearchUrl: 'https://example.com/live-search',
};

function pageOf(items: unknown[], liveResultCount = 0) {
  return {
    success: true,
    data: { items, total: items.length, page: 1, pageSize: 20, totalPages: 1, liveResultCount },
  };
}

async function mockApi(page: Page) {
  const listRequests: string[] = [];

  await page.route(
    (url) => url.pathname === '/api/opportunities/filters',
    (route: Route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            locations: [],
            industries: ['technology'],
            compensationRange: { min: 0, max: 2000 },
            compensationStats: { hasCompensation: true },
            formats: ['conference', 'meetup', 'podcast', 'webinar', 'workshop', 'panel', 'other'],
            compensationTypes: ['paid', 'travel', 'exposure', 'honorarium'],
          },
        },
      })
  );

  await page.route(
    (url) => url.pathname === '/api/opportunities',
    async (route: Route) => {
      const url = new URL(route.request().url());
      const params = url.searchParams;
      if (params.get('liveSearch') === 'true') {
        // The server merges live hits with stored rows and reports the live count.
        await route.fulfill({ json: pageOf([liveItem, storedItem], 1) });
        return;
      }
      listRequests.push(url.search);
      if (params.get('isRemote') === 'true') {
        await route.fulfill({ json: pageOf([remoteItem]) });
        return;
      }
      await route.fulfill({ json: pageOf([storedItem]) });
    }
  );

  return { listRequests };
}

test('live search merges, back restores the list, a filter change refetches', async ({ page }) => {
  const { listRequests } = await mockApi(page);

  await page.goto('/');
  await expect(page.getByText('Stored KubeCon Talk Call')).toBeVisible();

  // Typing is debounced into the URL, and the list is refetched for the new key.
  await page.getByPlaceholder('Search opportunities...').fill('kube');
  await page.waitForURL(/q=kube/);
  await expect.poll(() => listRequests.filter((q) => q.includes('search=kube')).length).toBe(1);

  // Live search replaces the list for the same key with the merged result.
  await page.getByRole('button', { name: 'Live Search' }).click();
  await expect(page.getByText('(1 from live search)')).toBeVisible();
  await expect(page.getByText('Live Found Kube Summit')).toBeVisible();
  const requestsBeforeDetail = listRequests.length;

  // The detail page for a live result is served from the cached list.
  await page.getByRole('link', { name: 'Live Found Kube Summit', exact: true }).click();
  await expect(page).toHaveURL(/\/opportunities\/live-abc$/);
  await expect(page.getByRole('heading', { name: 'Live Found Kube Summit' })).toBeVisible();

  // Back: same URL, same key, exact prior list, no refetch.
  await page.goBack();
  await expect(page).toHaveURL(/q=kube/);
  await expect(page.getByText('(1 from live search)')).toBeVisible();
  await expect(page.getByText('Live Found Kube Summit')).toBeVisible();
  expect(listRequests.length).toBe(requestsBeforeDetail);

  // Changing a filter is a new key: it refetches even though live results were showing.
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByLabel('Remote only').check();
  await page.waitForURL(/remote=1/);
  await expect.poll(() => listRequests.filter((q) => q.includes('isRemote=true')).length).toBe(1);
  await expect(page.getByText('Remote Kubernetes Webinar')).toBeVisible();
  await expect(page.getByText('(1 from live search)')).not.toBeVisible();
  await expect(page.getByText('Live Found Kube Summit')).not.toBeVisible();
});
