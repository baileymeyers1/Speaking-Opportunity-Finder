import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { config } from '../config/index.js';

/**
 * Single PrismaClient for the whole process.
 *
 * Prisma 7 talks to Postgres through a driver adapter: `PrismaPg` wraps a
 * `pg` pool built from `DATABASE_URL`. The pool connects lazily, so importing
 * this module never opens a connection; the first query does.
 *
 * Each `new PrismaClient()` owns its own pool, which multiplies connections on
 * every serverless cold start, so everything imports this instance. The global
 * cache keeps one instance across hot reloads in development as well.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: config.database.url });
  return new PrismaClient({
    adapter,
    log: config.isDev ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (config.isDev) {
  globalForPrisma.prisma = prisma;
}
