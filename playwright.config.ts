import { defineConfig } from '@playwright/test';

// Set PLAYWRIGHT_PORT when 5173 is taken (another worktree's dev server); the
// suite then targets a client on that port and starts only the client if needed.
const port = process.env.PLAYWRIGHT_PORT || '5173';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.PLAYWRIGHT_PORT ? `npm run dev --workspace=client -- --port ${port}` : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
