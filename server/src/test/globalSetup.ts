import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_DATABASE_URL } from './testDatabase.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Vitest global setup: bring the test database up to the current schema.
 * Runs once per `vitest` invocation, before any test file, with the same
 * `prisma.config.ts` the app uses, pointed at the test database.
 */
export default function setup(): void {
  try {
    execFileSync('npx', ['prisma', 'db', 'push'], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = error instanceof Error && 'stderr' in error ? String((error as { stderr: Buffer }).stderr) : '';
    throw new Error(
      `Could not push the Prisma schema to the test database (${TEST_DATABASE_URL.replace(/\/\/.*@/, '//…@')}).\n` +
        'Is Postgres running? Start it with `docker compose up -d db`, or set TEST_DATABASE_URL. ' +
        'A destructive schema change needs a manual `npx prisma db push --accept-data-loss` against that URL.\n' +
        output
    );
  }
}
