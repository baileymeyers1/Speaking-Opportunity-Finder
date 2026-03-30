import { test, expect } from '@playwright/test';

test.describe('Saved page', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/saved');

    // SavedOpportunities uses <Navigate to="/login" replace /> when not authenticated
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole('heading', { name: 'Log in' })
    ).toBeVisible();
  });

  test('authenticated user can navigate to saved page', async ({ page }) => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';

    // Register
    await page.goto('/register');
    await page.getByLabel('Email').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByLabel('Confirm Password').fill(testPassword);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(
      page.getByRole('button', { name: 'Logout' })
    ).toBeVisible({ timeout: 10000 });

    // Navigate to Saved via navbar link
    await page.getByRole('link', { name: 'Saved' }).click();
    await expect(page).toHaveURL(/\/saved/);

    // Verify the saved page heading
    await expect(
      page.getByRole('heading', { name: 'Saved Opportunities' })
    ).toBeVisible();
  });

  test('saved page shows category tabs', async ({ page }) => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';

    // Register and navigate to saved
    await page.goto('/register');
    await page.getByLabel('Email').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByLabel('Confirm Password').fill(testPassword);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(
      page.getByRole('button', { name: 'Logout' })
    ).toBeVisible({ timeout: 10000 });

    await page.goto('/saved');

    // Verify category tabs exist
    await expect(page.getByRole('tab', { name: /All/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Interested/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Applied/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Accepted/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Rejected/ })).toBeVisible();
  });

  test('saved page shows empty state for new user', async ({ page }) => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';

    // Register and navigate to saved
    await page.goto('/register');
    await page.getByLabel('Email').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByLabel('Confirm Password').fill(testPassword);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(
      page.getByRole('button', { name: 'Logout' })
    ).toBeVisible({ timeout: 10000 });

    await page.goto('/saved');

    // New user should see empty state with link back to browse
    await expect(
      page.getByText('No saved opportunities yet.')
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('link', { name: 'Browse opportunities' })
    ).toBeVisible();
  });
});
