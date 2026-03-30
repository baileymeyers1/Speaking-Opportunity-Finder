import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  const testPassword = 'TestPassword123!';

  test('register new account', async ({ page }) => {
    const testEmail = `test-${Date.now()}@example.com`;

    await page.goto('/register');

    // Verify the registration page loaded
    await expect(
      page.getByRole('heading', { name: 'Create an account' })
    ).toBeVisible();

    // Fill the form -- labels are "Email", "Password", "Confirm Password"
    await page.getByLabel('Email').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByLabel('Confirm Password').fill(testPassword);

    // Submit -- button text is "Create account"
    await page.getByRole('button', { name: 'Create account' }).click();

    // Should redirect to home and show Logout in navbar
    await expect(
      page.getByRole('button', { name: 'Logout' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('logout and login', async ({ page }) => {
    const testEmail = `test-${Date.now()}@example.com`;

    // Register first
    await page.goto('/register');
    await page.getByLabel('Email').fill(testEmail);
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByLabel('Confirm Password').fill(testPassword);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(
      page.getByRole('button', { name: 'Logout' })
    ).toBeVisible({ timeout: 10000 });

    // Logout
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('link', { name: 'Login' }).first()).toBeVisible();

    // Login
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Log in' })
    ).toBeVisible();

    await page.getByLabel('Email').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);
    await page.getByRole('button', { name: 'Log in' }).click();

    // Should redirect to home and show Logout
    await expect(
      page.getByRole('button', { name: 'Logout' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows validation error for mismatched passwords', async ({ page }) => {
    await page.goto('/register');

    await page.getByLabel('Email').fill('mismatch@example.com');
    await page.getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByLabel('Confirm Password').fill('DifferentPassword456!');

    await page.getByRole('button', { name: 'Create account' }).click();

    // Should show error message
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('login page has link to register', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('register page has link to login', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  });
});
