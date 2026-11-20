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

  test('with one speaker, a call is saved for them without asking', async ({ page }) => {
    await register(page);
    await addSpeaker(page, 'Dana Okafor');

    await page.goto('/');
    // No choice to make, so no picker; the pill is a plain score
    await expect(page.getByRole('combobox', { name: 'Fit for' })).toHaveCount(0);
    const row = page.locator('main li').filter({ has: page.locator('h3') }).first();
    await expect(row.getByRole('button', { name: /% match for Dana Okafor/ })).toBeVisible({ timeout: 10000 });

    await row.getByRole('button', { name: 'Save opportunity' }).click();
    await page.getByRole('menuitem', { name: 'Interested' }).click();
    await expect(row.getByRole('button', { name: 'Saved as interested' })).toBeVisible();

    // The roster counts it for her
    await page.goto('/speakers');
    await expect(page.locator('main li').filter({ hasText: 'Dana Okafor' })).toContainText('1 interested');
  });

  test('with several speakers, fit and saved calls are per person', async ({ page }) => {
    await register(page);
    await addSpeaker(page, 'Dana Okafor');
    await addSpeaker(page, 'Marcus Lee');
    await expect(page.locator('main li h2')).toHaveText(['Dana Okafor', 'Marcus Lee']);

    // Browse: everyone by default, each row naming who it fits best
    await page.goto('/');
    const fitFor = page.getByRole('combobox', { name: 'Fit for' });
    await expect(fitFor).toContainText('Everyone');
    const row = page.locator('main li').filter({ has: page.locator('h3') }).first();
    const title = ((await row.locator('h3 a').textContent()) ?? '').trim();
    await expect(row.getByRole('button', { name: /% match for (Dana Okafor|Marcus Lee)/ })).toBeVisible({ timeout: 10000 });

    // Saving asks who for
    await row.getByRole('button', { name: 'Save opportunity' }).click();
    await expect(page.getByRole('menuitem', { name: /No one yet/ })).toBeVisible();
    await page.getByRole('menuitem', { name: /Marcus Lee/ }).click();
    await expect(row.getByRole('button', { name: 'Saved for Marcus Lee' })).toBeVisible();

    // Saved: everyone's list says whose each call is
    await page.getByRole('link', { name: 'Saved' }).click();
    const savedRow = page.locator('main li').filter({ hasText: title });
    await expect(savedRow).toContainText('Saved for Marcus Lee');

    // One person's list holds only theirs
    const savedFor = page.getByRole('combobox', { name: 'For', exact: true });
    await savedFor.click();
    await page.getByRole('option', { name: 'Dana Okafor' }).click();
    await expect(savedRow).toHaveCount(0);
    await savedFor.click();
    await page.getByRole('option', { name: 'Everyone' }).click();
    await expect(savedRow).toBeVisible();

    // The row's menu gives the call to someone else, and says so
    await savedRow.getByRole('button', { name: /change the stage of/ }).click();
    await page.getByRole('menuitem', { name: 'Dana Okafor' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'is now saved for Dana Okafor.' })).toHaveCount(1);
    await expect(savedRow).toContainText('Saved for Dana Okafor');

    // The call's own page lists the whole roster
    await savedRow.locator('h3 a').click();
    const whoFits = page.locator('dl > div').filter({ hasText: 'Who fits' });
    await expect(whoFits).toContainText('Dana Okafor');
    await expect(whoFits).toContainText('Marcus Lee');
    await expect(page.getByRole('button', { name: 'Saved for Dana Okafor' })).toBeVisible();

    // And the choice made on Saved is still the choice on Browse
    await page.goto('/saved');
    await page.getByRole('combobox', { name: 'For', exact: true }).click();
    await page.getByRole('option', { name: 'Marcus Lee' }).click();
    await page.getByRole('link', { name: 'Browse', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Fit for' })).toContainText('Marcus Lee');
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
