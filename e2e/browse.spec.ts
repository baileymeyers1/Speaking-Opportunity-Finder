import { test, expect } from '@playwright/test';

test.describe('Browse page', () => {
  test('loads and displays the search interface', async ({ page }) => {
    await page.goto('/');

    // Verify search input exists (FilterPanel uses placeholder "Search opportunities...")
    await expect(page.getByPlaceholder('Search opportunities...')).toBeVisible();

    // Verify the page title/branding in the navbar
    await expect(page.getByText('Speaking Finder')).toBeVisible();

    // The page heading is a sentence computed from the list: what closes soon
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /close within a (week|month)\.|Nothing closes within a month\.|Nothing here has a deadline\.|No calls match\./
    );
  });

  test('lists calls in three lanes and switches between them', async ({ page }) => {
    await page.goto('/');

    const lanes = page.getByRole('group', { name: 'Which calls to list' });
    await expect(lanes.getByRole('button', { name: /Closing/ })).toHaveAttribute('aria-pressed', 'true');

    await lanes.getByRole('button', { name: /Always open/ }).click();
    await expect(page).toHaveURL(/lane=open/);
    await expect(lanes.getByRole('button', { name: /Always open/ })).toHaveAttribute('aria-pressed', 'true');
    // No deadlines in this lane, so the default order is by event date and says so
    await expect(page.getByLabel('Sort by')).toHaveText('Event date (soonest)');

    await lanes.getByRole('button', { name: /To watch/ }).click();
    await expect(page).toHaveURL(/lane=watch/);

    await lanes.getByRole('button', { name: /Closing/ }).click();
    await expect(page).not.toHaveURL(/lane=/);
  });

  test('search updates URL with query parameter', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByPlaceholder('Search opportunities...');
    await searchInput.fill('react');

    // Filters are debounced at 400ms, URL syncs after that
    await page.waitForURL(/q=react/, { timeout: 5000 });
    await expect(page).toHaveURL(/q=react/);
  });

  test('shows login and sign up links for unauthenticated users', async ({
    page,
  }) => {
    await page.goto('/');

    // Navbar shows Login and Sign Up buttons when not authenticated
    await expect(page.getByRole('link', { name: 'Login' }).first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Sign Up' }).first()
    ).toBeVisible();
  });

  test('shows login banner that can be dismissed', async ({ page }) => {
    await page.goto('/');

    // Banner text: "Sign up or log in to save opportunities and searches."
    const bannerText = page.getByText('to save opportunities and searches');
    await expect(bannerText).toBeVisible();

    // Dismiss button has aria-label "Dismiss banner"
    await page.getByLabel('Dismiss banner').click();
    await expect(bannerText).not.toBeVisible();
  });

  test('has sort dropdown defaulting to deadline', async ({ page }) => {
    await page.goto('/');

    // The sort dropdown should be visible with "Deadline (soonest)" default
    await expect(page.getByText('Deadline (soonest)')).toBeVisible();
  });

  test('has filters toggle button', async ({ page }) => {
    await page.goto('/');

    const filtersButton = page.getByRole('button', { name: /Filters/ });
    await expect(filtersButton).toBeVisible();

    // Clicking it expands the advanced filters section
    await filtersButton.click();
    await expect(page.getByRole('heading', { name: 'Format', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Location', exact: true })).toBeVisible();
  });
});
