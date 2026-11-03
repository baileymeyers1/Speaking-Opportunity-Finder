import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './src/test/testDatabase.js';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Every worker talks to the test database, never to the dev one. The
    // global setup pushes the schema into it first (see src/test/globalSetup.ts).
    env: { DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' },
    globalSetup: ['./src/test/globalSetup.ts'],
  },
});
