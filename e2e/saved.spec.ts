import { test, expect, type Page } from '@playwright/test';

/** A fresh account, signed in: every test here starts with nothing saved. */
async function register(page: Page) {
  const testEmail = `test-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  const testPassword = 'TestPassword123!';

  await page.goto('/register');
  await page.getByLabel('Email').fill(testEmail);
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByLabel('Confirm Password').fill(testPassword);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 10000 });
}

test.describe('Saved page', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/saved');

    // SavedOpportunities uses <Navigate to="/login" replace /> when not authenticated
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  });

  test('authenticated user can navigate to saved page', async ({ page }) => {
    await register(page);

    await page.getByRole('link', { name: 'Saved' }).click();
    await expect(page).toHaveURL(/\/saved/);

    // The page has no visible headline: its name is there for assistive technology
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saved calls');
  });

  test('lists one stage at a time and keeps the stage in the URL', async ({ page }) => {
    await register(page);
    await page.goto('/saved');

    const stages = page.getByRole('group', { name: 'Which saved calls to list' });
    await expect(stages.getByRole('button')).toHaveCount(4);
    await expect(stages.getByRole('button', { name: /Interested/ })).toHaveAttribute('aria-pressed', 'true');

    await stages.getByRole('button', { name: /Applied/ }).click();
    await expect(page).toHaveURL(/stage=applied/);
    await expect(stages.getByRole('button', { name: /Applied/ })).toHaveAttribute('aria-pressed', 'true');

    for (const stage of [/Accepted/, /Rejected/]) {
      await expect(stages.getByRole('button', { name: stage })).toBeVisible();
    }

    await stages.getByRole('button', { name: /Interested/ }).click();
    await expect(page).not.toHaveURL(/stage=/);
  });

  test('saved page shows empty state for new user', async ({ page }) => {
    await register(page);
    await page.goto('/saved');

    // New user should see empty state with link back to browse
    await expect(page.getByText('Nothing saved yet.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Browse calls' })).toBeVisible();
  });

  test('a saved call moves from stage to stage, and can be removed', async ({ page }) => {
    await register(page);
    await page.goto('/');

    // Save the first call on Browse as one to apply to
    const browseRow = page.locator('main li').filter({ has: page.locator('h3') }).first();
    const title = ((await browseRow.locator('h3 a').textContent()) ?? '').trim();
    await browseRow.getByRole('button', { name: 'Save opportunity' }).click();
    await page.getByRole('menuitem', { name: 'Interested' }).click();
    await expect(browseRow.getByRole('button', { name: 'Saved as interested' })).toBeVisible();

    await page.getByRole('link', { name: 'Saved' }).click();
    const stages = page.getByRole('group', { name: 'Which saved calls to list' });
    const savedRow = page.locator('main li').filter({ hasText: title });
    await expect(savedRow).toBeVisible();
    await expect(stages.getByRole('button', { name: /Interested/ })).toContainText('1');

    // Moving it takes it off this stage's list and says where it went
    await savedRow.getByRole('button', { name: /change the stage of/ }).click();
    await page.getByRole('menuitem', { name: 'Applied' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'moved to Applied.' })).toHaveCount(1);
    await expect(savedRow).toHaveCount(0);
    await expect(page.getByText('Nothing waiting to be applied to.')).toBeVisible();
    await expect(stages.getByRole('button', { name: /Applied/ })).toContainText('1');

    // Once applied, the row no longer asks you to apply
    await stages.getByRole('button', { name: /Applied/ }).click();
    await expect(savedRow).toBeVisible();
    await expect(savedRow.getByRole('link', { name: /^View the call page of/ })).toBeVisible();

    await savedRow.getByRole('button', { name: /change the stage of/ }).click();
    await page.getByRole('menuitem', { name: 'Remove from saved' }).click();
    await expect(page.getByText('Nothing saved yet.')).toBeVisible();
  });
});
