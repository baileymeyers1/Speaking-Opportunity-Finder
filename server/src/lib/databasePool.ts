import type { PoolConfig } from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

function hostOf(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname || null;
  } catch {
    return null;
  }
}

/**
 * `pg` pool settings for a DATABASE_URL.
 *
 * Prisma's own engine negotiated TLS with the server by itself. `pg` defaults
 * to plaintext, which managed Postgres (Render, Neon, …) refuses with
 * "no pg_hba.conf entry … SSL off", surfaced by Prisma as P1010. So a remote
 * host gets TLS, verified against the system CA bundle; a local host (the
 * Docker database) stays plaintext.
 *
 * An explicit `sslmode=` in the URL always wins: `pg` parses it out of the
 * connection string and that result overrides the `ssl` option set here
 * (`?sslmode=disable` turns TLS off, `?sslrootcert=…` pins a CA).
 */
export function databasePoolConfig(connectionString: string | undefined): PoolConfig {
  if (!connectionString) return { connectionString };
  const host = hostOf(connectionString);
  if (!host || LOCAL_HOSTS.has(host)) return { connectionString };
  return { connectionString, ssl: true };
}
