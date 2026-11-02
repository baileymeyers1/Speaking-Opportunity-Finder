# Project Status

Current state only. History lives in `docs/CHANGELOG.md`. Full review: `docs/plans/2026-11-02-architecture-review.md`. What to build next and why: `docs/plans/2026-11-02-roadmap.md`.

## Last Updated
- **Date:** 2026-11-02
- **Session summary:** One schema-validated Claude extraction for both enrichment paths; the enrichment worker fetches the apply page; stored listings are re-verified on a schedule (`verifiedAt`); live search returns in ~10s and persists every hit for the worker; client shows verification age and approximate dates.

## What's Working
- Browse, filters, saved opportunities, saved searches, auth (JWT cookie), admin dashboard.
- **Hosting: Vercel only.** Express runs as one serverless function; Vercel Cron drives syncs and enrichment. The build copies the production schema and runs `prisma db push`, so schema changes deploy themselves.
- **Scrapers** (registry in `server/src/scrapers/index.ts`): confs.tech, javaconferences.org, callingallpapers.com, developers.events, linkup (daily, Linkup runs a 6-query rotating slice); wikicfp.com, conferencealerts.com (weekly). papercall.io was removed: the domain no longer resolves. Each run persists its own rows and is recorded in `ScraperRun` (`GET /api/admin/analytics/scraper-runs`). Syncs take a time budget (50s under cron) and run least-recently-run sources first, so nothing starves.
- **One extraction call** (`server/src/services/extraction.ts`): structured outputs (`output_config.format`, strict JSON schema) on `claude-haiku-5-5` return typed dates, location, closed/relevant flags, compensation, format, industries, cleaned title/organization and a high/medium/low confidence per date field. `mergeExtraction` holds the single set of merge rules. Enrichment, verification and live search all go through it.
- **Background enrichment** fetches `applyUrl` first (`services/pageText.ts`, 8s, 5000 visible chars) and extracts from the page text; a 404/410 closes the row without a Claude call. DB-backed daily budget (200 calls), per-row claim lock, 3 retries, 50s time budget per cron run. Re-scrapes preserve enriched fields. Cleanup never deletes saved rows. Closed/irrelevant rows are flagged in columns and hidden.
- **Scheduled verification** (`services/verification.ts`): once no unenriched rows remain, the same cron re-checks stored listings against their page. Deadlines within 14 days are re-checked every 2 days, everything visible weekly; dates, location, remote flag, compensation and `isClosed` follow the page; `verifiedAt` / `verificationError` / `dateConfidence` are stored. Same daily budget.
- **Live search** runs one Linkup page per query variant in parallel, dedupes by URL, enriches only the top 8 synchronously (page fetch + extraction) and persists every hit inside the request as `source: 'Live Search'`; the rest are stored with `enrichmentStatus: null` for the worker. Measured: 15 results in 10.6s against the real APIs.
- **Client** shows "Verified Xd ago" on cards and the detail page, and renders low-confidence dates as "~Dec 1, 2026" with a tooltip.
- One shared Prisma client (`server/src/lib/prisma.ts`). Search is case-insensitive on Postgres; industry filter matches the exact JSON token.

## Deploy Gotchas
- Two Prisma schema files are maintained by hand; keep them identical except for `provider` (`diff prisma/schema.prisma prisma/schema.production.prisma`).
- Env vars live in the Vercel dashboard: `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `WEB_SEARCH_API_KEY`. No `CLAUDE_MODEL` override is set; if you add one it must be a current model (the request sends `output_config.effort`).
- `vercel.json` declares three crons including a 5-minute one. Confirm the Vercel plan allows that cadence; on Hobby, crons are limited and the enrichment cron would not run as declared.
- The `prisma/dev.db` SQLite file is local only and has been through several `db push` runs today.

## What's Next (see roadmap for the reasoning)
1. Surface `ScraperRun` and the verification counters in the admin dashboard (APIs exist; UI does not yet).
2. Client: show "enriching…" on live cards that were persisted unenriched and refetch once; exclude low-confidence deadlines from "closing soon" styling.
3. Email provider for saved-search digests and password reset; application tracker + ICS feed.
4. Client: TanStack Query, URL as the only filter state, split the large pages, real shared types, ESLint.
5. Single Postgres schema; Prisma 7; Anthropic SDK 1.x; `npm audit fix`.

## Known Issues & Tech Debt
- Live search Claude calls (up to 8 per request) are not counted against the daily enrichment budget; only the worker's are.
- Verification spends whatever budget enrichment leaves each day; with ~1,400 cron slots/day and a 200-call cap, the cap is the real limit.
- `express-rate-limit` uses the in-memory store, which does nothing on serverless.
- Password reset only logs the token to the console.
- Deadlines are UTC midnight, so they expire the evening before in US timezones.
- `shared/types.ts` is unused and drifted.
- conferencealerts.com is a general conference directory; rows kept are those with an open abstract deadline, and some are expos whose deadline equals the event date. WikiCFP rows are academic calls for papers.
- Rows enriched before verification shipped have `verifiedAt = null` and are picked up by the weekly sweep, oldest first.
- `server/src/scripts/promoteAdmin.ts` still creates its own PrismaClient (standalone script, acceptable).

## Environment Notes
- Dev: SQLite at `prisma/dev.db`; run `npx prisma db push` after pulling schema changes.
- Manual sync of one source (admin token required): `POST /api/sync?mode=daily&scraper=confs.tech`.
- Enrichment calls that hit Claude are manual only; unit tests never call the API. A live check: `npx tsx` a script that imports `services/extraction.ts` with `ANTHROPIC_API_KEY` exported (see CHANGELOG 2026-11-02 for what was run).
- The worktree has no `.env`; export `ANTHROPIC_API_KEY`, `WEB_SEARCH_API_KEY` and a `DATABASE_URL` (`file:…`) and run `npx prisma db push` before running anything live.
