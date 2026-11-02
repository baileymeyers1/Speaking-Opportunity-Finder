# Project Status

Current state only. History lives in `docs/CHANGELOG.md`. Full review: `docs/plans/2026-11-02-architecture-review.md`. What to build next and why: `docs/plans/2026-11-02-roadmap.md`.

## Last Updated
- **Date:** 2026-11-02
- **Session summary:** Architecture review; P0 data-integrity fixes merged and deployed (PR #1); ingestion consolidated (registry, per-scraper runs, time budget, dead scrapers removed); Vercel settled as the only deploy target.

## What's Working
- Browse, filters, saved opportunities, saved searches, auth (JWT cookie), admin dashboard.
- **Hosting: Vercel only.** Express runs as one serverless function; Vercel Cron drives syncs and enrichment. The build copies the production schema and runs `prisma db push`, so schema changes deploy themselves.
- **Scrapers** (registry in `server/src/scrapers/index.ts`): confs.tech, javaconferences.org, callingallpapers.com, developers.events, linkup (daily, Linkup runs a 6-query rotating slice); papercall.io, wikicfp.com, conferencealerts.com (weekly). Each run persists its own rows and is recorded in `ScraperRun` (`GET /api/admin/analytics/scraper-runs`). Syncs take a time budget (50s under cron) and run least-recently-run sources first, so nothing starves.
- Background enrichment on `claude-haiku-5-5` with a DB-backed daily budget (200 calls), per-row claim lock and 3 retries. Re-scrapes preserve enriched fields. Cleanup never deletes saved rows. Closed/irrelevant rows are flagged in columns and hidden.
- One shared Prisma client (`server/src/lib/prisma.ts`). Search is case-insensitive on Postgres; industry filter matches the exact JSON token.

## Deploy Gotchas
- Two Prisma schema files are maintained by hand; keep them identical except for `provider` (`diff prisma/schema.prisma prisma/schema.production.prisma`).
- Env vars live in the Vercel dashboard: `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `WEB_SEARCH_API_KEY`. No `CLAUDE_MODEL` override is set; if you add one it must be a current model (the request sends `output_config.effort`).
- `vercel.json` declares three crons including a 5-minute one. Confirm the Vercel plan allows that cadence; on Hobby, crons are limited and the enrichment cron would not run as declared.
- The `prisma/dev.db` SQLite file is local only and has been through several `db push` runs today.

## What's Next (see roadmap for the reasoning)
1. Verify listings against their own page on a schedule (`verifiedAt`), unify the two enrichment paths, and move both Claude calls to structured outputs with confidence.
2. Surface `ScraperRun` in the admin dashboard (API exists; UI does not yet).
3. Live search: persist Linkup hits fast and let the enrichment cron finish them; stop the fire-and-forget auto-save.
4. Email provider for saved-search digests and password reset; application tracker + ICS feed.
5. Client: TanStack Query, URL as the only filter state, split the large pages, real shared types, ESLint.
6. Single Postgres schema; Prisma 7; Anthropic SDK 1.x; `npm audit fix`.

## Known Issues & Tech Debt
- Live search still runs the full page-fetch + Claude pipeline inside the request and auto-saves after the response, which Vercel freezes.
- `express-rate-limit` uses the in-memory store, which does nothing on serverless.
- Password reset only logs the token to the console.
- Deadlines are UTC midnight, so they expire the evening before in US timezones.
- `shared/types.ts` is unused and drifted.
- A row marked `skipped` for a too-short description is never revisited.
- `server/src/scripts/promoteAdmin.ts` still creates its own PrismaClient (standalone script, acceptable).

## Environment Notes
- Dev: SQLite at `prisma/dev.db`; run `npx prisma db push` after pulling schema changes.
- Manual sync of one source (admin token required): `POST /api/sync?mode=daily&scraper=confs.tech`.
- Enrichment calls that hit Claude are manual only; unit tests never call the API.
