import { PrismaClient } from '@prisma/client';

/**
 * Single PrismaClient for the whole process.
 *
 * Each `new PrismaClient()` opens its own connection pool. The server used to
 * create eleven of them, one per module, which multiplies connections on every
 * serverless cold start. The global cache keeps one instance across hot reloads
 * in development as well.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
