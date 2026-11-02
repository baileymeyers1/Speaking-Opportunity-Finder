import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Date formatting is asserted in UTC; run the suite west of Greenwich so a
// regression to local-time formatting shows up as an off-by-one day.
process.env.TZ = 'America/Los_Angeles';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
