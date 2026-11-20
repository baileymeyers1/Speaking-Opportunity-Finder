import { test, expect, type Page } from '@playwright/test';

/** A fresh account, signed in: every test here starts with nobody on the roster. */
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

async function addSpeaker(page: Page, name: string, title = '') {
  await page.goto('/speakers/new');
  await page.getByLabel('Name').fill(name);
  if (title) await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add speaker' }).click();
  await expect(page).toHaveURL(/\/speakers$/);
}

test.describe('Speakers', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/speakers');
    await expect(page).toHaveURL(/\/login/);
  });

  test('the old profile address lands on the roster', async ({ page }) => {
    await register(page);
    await page.goto('/profile');

    await expect(page).toHaveURL(/\/speakers$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Speakers');
    await expect(page.getByText('Nobody on the roster yet.')).toBeVisible();
  });

  test('a speaker is added, changed and removed', async ({ page }) => {
    await register(page);

    await page.getByRole('link', { name: 'Speakers' }).click();
    await page.getByRole('link', { name: 'Add speaker' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New speaker');

    await page.getByLabel('Name').fill('Dana Okafor');
    await page.getByLabel('Title').fill('Chief medical officer');
    await page.getByLabel('Topics').fill('digital health');
    await page.getByLabel('Topics').press('Enter');
    await page.getByRole('button', { name: 'Add speaker' }).click();

    // Back on the roster, as a row
    await expect(page).toHaveURL(/\/speakers$/);
    const row = page.locator('main li').filter({ hasText: 'Dana Okafor' });
    await expect(row).toContainText('Chief medical officer');
    await expect(row).toContainText('digital health');

    // The row opens the speaker; a change is saved in place
    await row.getByRole('link', { name: 'Dana Okafor' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dana Okafor');
    await page.getByLabel('Title').fill('CMO, Northwind Health');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to speakers' }).click();
    await expect(page.locator('main li').filter({ hasText: 'Dana Okafor' })).toContainText('CMO, Northwind Health');

    // Removing asks first
    await page.locator('main li').getByRole('link', { name: 'Dana Okafor' }).click();
    await page.getByRole('button', { name: 'Remove speaker' }).click();
    await expect(page.getByText('Remove Dana Okafor?')).toBeVisible();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(page).toHaveURL(/\/speakers$/);
    await expect(page.getByText('Nobody on the roster yet.')).toBeVisible();
  });

  test('with several speakers, the roster says whose fit Browse shows', async ({ page }) => {
    await register(page);
    await addSpeaker(page, 'Dana Okafor');
    await addSpeaker(page, 'Marcus Lee');

    await expect(page.locator('main li h2')).toHaveText(['Dana Okafor', 'Marcus Lee']);
    await expect(page.getByText('Browse shows fit for Dana Okafor, the first on this list.')).toBeVisible();

    // And Browse does: every stored call now carries a match score
    await page.goto('/');
    await expect(page.locator('main li').getByRole('button', { name: /% match/ }).first()).toBeVisible({ timeout: 10000 });
  });

  test('a speaker needs a name', async ({ page }) => {
    await register(page);
    await page.goto('/speakers/new');
    await page.getByRole('button', { name: 'Add speaker' }).click();

    // The browser stops the empty form; nothing was added
    await expect(page).toHaveURL(/\/speakers\/new$/);
    await page.goto('/speakers');
    await expect(page.getByText('Nobody on the roster yet.')).toBeVisible();
  });
});
