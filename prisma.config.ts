import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 reads the connection string here, not from the schema file. The
// server reads the same DATABASE_URL through server/src/lib/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
