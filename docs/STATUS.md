# Project Status

Current state only. History lives in `docs/CHANGELOG.md`. Full review of the codebase: `docs/plans/2026-11-02-architecture-review.md`.

## Last Updated
- **Date:** 2026-11-02
- **Session summary:** Architecture review, then fixed the P0 data-integrity bugs in the sync/enrichment loop.

## What's Working
- Browse, filters, saved opportunities, saved searches, auth (JWT cookie), admin dashboard.
- Structured scrapers that actually return data: confs.tech, javaconferences, callingallpapers.
- Linkup live search with Claude page extraction (heavy; see "What's Next").
- Background enrichment on `claude-haiku-5-5` with a DB-backed daily budget (200 calls) and per-row claim lock. Verified live on 2026-11-02.
- Re-scrapes preserve Claude-enriched fields and never touch enrichment bookkeeping (`scrapers/persistData.ts`, tested).
- Cleanup never deletes rows a user has saved.
- Closed / irrelevant CFPs are stored as `isClosed` / `isRelevant` columns and excluded from browse.

## Deploy Gotchas (read before deploying)
- **Schema changed on 2026-11-02.** New columns on `Opportunity` and a new `EnrichmentUsage` table. The Vercel build command (`vercel.json`) runs `prisma generate` but **not** `prisma db push`, so run `npx prisma db push` against the production `DATABASE_URL` (with `schema.production.prisma`) before or with the deploy, or the API will 500 on every Opportunity query.
- If `CLAUDE_MODEL` or `CLAUDE_MAX_TOKENS` are set in the Vercel dashboard they override the new defaults (`claude-haiku-5-5`, 2048). Unset them or update them. The enrichment request now sends `output_config.effort`, which older models reject.
- Two Prisma schema files are maintained by hand; they must stay identical except for `provider`. `diff prisma/schema.prisma prisma/schema.production.prisma` should show only comments and the provider line.
- Hosting is ambiguous in the repo: `render.yaml` and CLAUDE.md say Render; `vercel.json`, `api/index.ts` and `.vercel/` say Vercel. Settle this first (review doc, section 0).

## What's Next (from the review, in order)
1. Settle Vercel vs Render; delete the loser's config; update CLAUDE.md; archive root planning docs.
2. Prisma client singleton (11 instances today); case-insensitive search on Postgres (`mode: 'insensitive'`).
3. Delete dead scrapers (eventbrite, linkedinEvents, airtableEvents); fix the shared HTML helper bug that makes usMegaEvents / conferenceAlerts / pacEvents / prNewsOnline return 0 rows; fix developers.events schema and WikiCFP URL normalization; add fixture tests; one cron per scraper with per-scraper persistence.
4. Live search: persist Linkup results fast, let the enrichment cron do page-fetch + Claude; dedupe before enrichment; stop the fire-and-forget auto-save.
5. Client: TanStack Query, URL as the only filter state, split Home/FilterPanel/AdminDashboard, make `shared/types.ts` the real wire types, install ESLint.

## Known Issues & Tech Debt
- Live search runs up to 9 Linkup calls, 150 page fetches and 15 Claude calls inside one request; Vercel caps functions at 60s.
- `express-rate-limit` uses the in-memory store, which does nothing on serverless.
- Password reset only logs the token to the console; no email provider.
- Deadlines are parsed as UTC midnight, so they expire the evening before in US timezones.
- `shared/types.ts` is unused and drifted; client and server each define their own types.
- `npm audit`: 15 vulnerabilities (qs via express 4, source-map-js); `npm audit fix` resolves them.
- A row marked `skipped` because its description was too short is never revisited even if a later scrape has a longer description.

## Environment Notes
- Dev: SQLite at `prisma/dev.db`; `npx prisma db push` already applied the 2026-11-02 schema locally.
- Enrichment tests that hit Claude are manual only (`enrichOpportunity` called from a scratch script); unit tests don't call the API.
