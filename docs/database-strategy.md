# Database Strategy

## Current Setup

| Environment | Database   | Schema File                        | Connection                  |
|-------------|------------|------------------------------------|-----------------------------|
| Development | SQLite     | `prisma/schema.prisma`             | `DATABASE_URL` env var      |
| Production  | PostgreSQL | `prisma/schema.production.prisma`  | `DATABASE_URL` on Render    |

SQLite is used locally for zero-config development. Production runs PostgreSQL on Render's free tier.

## Schema Management

Two schema files are maintained in parallel:

- **`prisma/schema.prisma`** -- Uses `provider = "sqlite"` for local development.
- **`prisma/schema.production.prisma`** -- Uses `provider = "postgresql"` for Render.

**Any schema change must be applied to both files.** They should stay identical except for the `datasource.provider` value.

### Applying Changes

- **Dev:** Run `npx prisma db push` to sync the local SQLite database.
- **Prod:** The Render build command copies the production schema before generating the client:
  ```bash
  cp prisma/schema.production.prisma prisma/schema.prisma
  ```
  Prisma then generates the client against PostgreSQL at build time.

### Adding a New Model or Field

1. Edit `prisma/schema.prisma` (SQLite version).
2. Run `npx prisma db push` locally to verify.
3. Copy the same change into `prisma/schema.production.prisma`.
4. Commit both files. The next deploy applies the change in production.

## Backup Strategy

Render's free tier does not include automatic database backups. You are responsible for your own backups.

### Manual Backup

```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Recovery

```bash
psql $DATABASE_URL < backup-YYYYMMDD.sql
```

### Recommendations

- Set up a weekly `pg_dump` cron job (e.g., via a local machine, GitHub Actions, or a small scheduled task) to keep rolling backups.
- Alternatively, upgrade to Render's paid tier for automatic daily backups with point-in-time recovery.
- Store backup files in a durable location (S3 bucket, Google Drive, or a local backup directory outside the project).

## Data Lifecycle

### Ingestion

Opportunities are scraped on two schedules:

- **Daily:** Fast scrapers (CallingAllPapers, Sessionize, PaperCall, WikiCFP).
- **Weekly:** Deep scrapers (Linkup with 30 industry queries, Eventbrite, etc.).

New opportunities are deduplicated by `applyUrl` (unique constraint).

### Enrichment

Scraped opportunities are enriched via the Claude API to fill in missing metadata (description, topics, industries). Enrichment status is tracked per opportunity (`enrichmentStatus` field).

### Quality Scoring

Each opportunity receives a `qualityScore` (0-100). Results with a score below 15 are hidden from the browse view. The threshold of 15 filters out entries that have almost no useful metadata beyond a title and URL.

### Deadline Handling

- The default query filter returns only opportunities with future deadlines.
- Past-deadline opportunities remain in the database and are shown as grayed out for users who saved them.

### Data Retention

There is currently no automatic cleanup of stale data. Past-deadline and low-quality opportunities accumulate indefinitely. Consider adding a retention policy -- for example, deleting unsaved opportunities older than 6 months -- to keep the database size manageable.

## Migration Path

### Current: Render PostgreSQL (Free Tier)

Render's free-tier databases expire after 90 days of inactivity. If the database expires or you need to migrate:

1. Export: `pg_dump $DATABASE_URL > export.sql`
2. Create a new database (on Render or elsewhere).
3. Import: `psql $NEW_DATABASE_URL < export.sql`
4. Update `DATABASE_URL` in the deployment environment.

### Alternative: Vercel Postgres

1. Provision a Vercel Postgres database.
2. Update `schema.production.prisma` to use the `@vercel/postgres` connection string.
3. Keep the provider as `postgresql` (Vercel Postgres is standard PostgreSQL).
4. Update deployment config to use Vercel's `DATABASE_URL`.

### Alternative: Supabase

1. Create a free-tier Supabase project (includes PostgreSQL with automatic daily backups).
2. Use the Supabase connection string as `DATABASE_URL`.
3. No schema changes needed -- Supabase runs standard PostgreSQL.
4. Benefits: automatic backups, a web-based SQL editor, and no 90-day expiry on the free tier.
