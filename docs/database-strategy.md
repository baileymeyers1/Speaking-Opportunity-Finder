# Database Strategy

## Current Setup

| Environment | Database | Where | Connection |
|-------------|----------|-------|------------|
| Development | PostgreSQL 16 | `docker-compose.yml` (`docker compose up -d db`), host port 5433 | `DATABASE_URL` in `.env` |
| Tests | PostgreSQL 16 | same container, database `speaking_finder_test` | `TEST_DATABASE_URL` (default in `server/src/test/testDatabase.ts`) |
| Production | PostgreSQL | managed, `DATABASE_URL` in the Vercel dashboard | Vercel env var |

One Prisma schema, `prisma/schema.prisma`, with `provider = "postgresql"`. The Prisma CLI reads the connection string from `prisma.config.ts`; the server builds its client on the `pg` driver adapter in `server/src/lib/prisma.ts`. There is no SQLite anywhere any more.

## Schema Management

The project uses `prisma db push`, not migrations: the Vercel build pushes the schema to the production database before building the app, so a schema change deploys itself. A preview deployment pushes to the same database, so a branch's schema change reaches production the moment its preview builds; keep schema changes additive.

### Changing the schema

1. Edit `prisma/schema.prisma`.
2. `npx prisma generate` (the client is generated into `server/src/generated/prisma`, gitignored).
3. `npx prisma db push` against the local database; the server test suite pushes to the test database on its own.
4. Before pushing the branch, confirm the change is what production will receive:
   ```bash
   npx prisma migrate diff --from-url "$PRODUCTION_DATABASE_URL" --to-schema prisma/schema.prisma --script
   ```
   (`vercel env pull --environment=production` gives you the URL; never commit the pulled file.)

Prisma 7's CLI refuses `db push --accept-data-loss` and `--force-reset` when it detects it is being run by an AI coding agent; run those from your own terminal.

## Backup Strategy

The managed Postgres keeps its own backups; a manual copy is still cheap:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
psql "$DATABASE_URL" < backup-YYYYMMDD.sql
```

## Data Lifecycle

- **Ingestion.** Daily and weekly scrapers (`server/src/scrapers/index.ts`) plus live search persist opportunities; `applyUrl` is unique.
- **Enrichment and verification.** The 5-minute cron fetches each row's page and runs the one Claude extraction (`services/extraction.ts`); verified rows carry `verifiedAt`. Re-scrapes never overwrite enriched fields.
- **Quality.** Rows below `qualityScore` 15 never surface. Closed and irrelevant rows are flagged, not deleted; cleanup never deletes a saved row.
- **Deadlines.** The default list shows only future or missing deadlines.

## Deferred

- `industries`, `topics`, `preferredFormats` and `dateConfidence` are JSON strings in `String` columns; the filters match quoted tokens. Native `String[]` / `Json` columns are the next change, together with the canonical `Event` entity (roadmap item 3).
- Proper migrations (`prisma migrate`) once more than one person deploys.
