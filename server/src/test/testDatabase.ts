/**
 * Where the server test suite keeps its data: a Postgres database of its own,
 * so tests never touch the dev database. `docker compose up -d db` creates it
 * next to the dev one (docker/init-test-db.sql); set TEST_DATABASE_URL to use
 * a Postgres elsewhere.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/speaking_finder_test';
