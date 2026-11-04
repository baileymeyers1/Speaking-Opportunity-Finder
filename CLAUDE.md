# Speaking Opportunity Finder

## What It Is
Aggregates speaking opportunities (CFPs, conferences, podcasts, meetups) from multiple scrapers and live search. Users filter by industry/location, save opportunities, and get AI-enriched details.

## Stack
- **Monorepo** with npm workspaces: `client/`, `server/`, `shared/`
- **Client:** React 18 + Vite + TypeScript + Tailwind CSS + React Router
- **Server:** Express + TypeScript + Prisma ORM
- **Database:** PostgreSQL everywhere. Dev: `postgres:16` from `docker-compose.yml` (`docker compose up -d db`, host port 5433). Prod: `DATABASE_URL` set in Vercel. Prisma 7 with the `pg` driver adapter (`@prisma/adapter-pg`); one schema, `prisma/schema.prisma`; the connection string lives in `prisma.config.ts`.
- **AI:** Anthropic Claude SDK 1.x (opportunity enrichment)
- **Auth:** bcryptjs + JWT (custom, no third-party auth)
- **Hosting:** Vercel. Express app runs as one serverless function (`api/index.ts` imports `server/dist/app.js`); Vercel Cron drives syncs and enrichment (`vercel.json`). 60s function limit.

## Key Conventions
- Prisma for all DB access through the shared client in `server/src/lib/prisma.ts` (never `new PrismaClient()` in a module). The client is generated into `server/src/generated/prisma` (gitignored; `npx prisma generate`); import `PrismaClient`, `Prisma` and model types from `../generated/prisma/client.js`, never from `@prisma/client`.
- JSON arrays stored as strings (`industries`, `topics` fields); the query code matches quoted JSON tokens (`"ai"`), so moving them to native arrays is a separate change.
- Server tests run against the `speaking_finder_test` database (`server/vitest.config.ts` pushes the schema there first); `*.db.test.ts` files hit it for real, everything else mocks `lib/prisma.js`.
- Live search results show "Live" badges; save them via `POST /api/opportunities/save-live`.
- Client uses localStorage caching for instant load while the serverless API cold-starts; it pings the health endpoint on mount.
- Default query filter: only future-deadline opportunities shown; `isClosed`/`isRelevant` rows never shown.
- Scraped re-syncs never overwrite Claude-enriched fields or enrichment bookkeeping (`server/src/scrapers/persistData.ts`).
- Enrichment budget and row claims live in the DB (`server/src/services/enrichmentBudget.ts`), not process memory. Verification shares both.
- All Claude extraction goes through `extraction.ts` (structured outputs, strict schema); never add a second prompt or regex-parse model output.
- Live search persists every hit in the request; the worker enriches what the request did not. Nothing runs after the response on Vercel.
- Dynamic year references throughout -- no hardcoded years.

## Key Files
- `server/src/services/opportunityService.ts` -- Core queries + future-deadline filter
- `server/src/services/liveSearchService.ts` -- Live search integration
- `server/src/services/extraction.ts` -- The one Claude call (structured outputs) and the merge rules; `pageText.ts` fetches apply pages
- `server/src/services/enrichmentService.ts` -- Enrichment of a row via extraction; `backgroundEnrichment.ts` -- cron worker (enrich, then verify)
- `server/src/services/verification.ts` -- Which stored rows are re-verified when, and what a check updates
- `server/src/scrapers/index.ts` -- Scraper registry, per-scraper runs with time budget, persistence
- `server/src/scrapers/` -- confs.tech, javaconferences, callingallpapers, developers.events, pretalx (hosted API + CFP pages), sessionize (public event pages via the events sitemap) and a Linkup slice (daily); WikiCFP, ConferenceAlerts (weekly). `linkupQueries.ts` holds the Linkup query set, each entry with its `format`; `services/searchLog.ts` promotes frequent live-search queries into the daily Linkup run
- `client/src/pages/Home.tsx` -- Main grid with unified live+stored results
- `client/src/components/` -- OpportunityCard (deadline badges), MultiSelectDropdown
- `prisma/schema.prisma` -- Data model (User, Opportunity, SavedOpportunity, SavedSearch, EnrichmentUsage, ScraperRun, SearchLog, SpeakerProfile); `prisma.config.ts` -- schema path and `DATABASE_URL` for the Prisma CLI
- `vercel.json` -- Build, routing and cron schedules
- `docs/STATUS.md` -- Current state and deploy gotchas; `docs/plans/2026-11-02-architecture-review.md` -- full review

## Build & Dev
```bash
docker compose up -d db   # Local Postgres (dev + test databases) on :5433
npx prisma generate       # Generate the client into server/src/generated/prisma
npx prisma db push        # Push schema changes to DATABASE_URL
npm run dev               # Starts client + server concurrently
npm run build             # Builds all workspaces
npx prisma studio         # Browse DB
```

## Deployment
Vercel. Push to main auto-deploys; the build runs `prisma generate`, then `prisma db push` against the production `DATABASE_URL`, then `npm run build`. Preview deployments push to the same database, so a schema change on a branch reaches production as soon as the preview builds. Env vars live in the Vercel dashboard (`DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `WEB_SEARCH_API_KEY`).

## Sync Schedule (Vercel Cron)
- **Daily 06:00 UTC:** structured scrapers, least-recently-run first, within a 50s budget
- **Weekly Mon 08:00 UTC:** slower sources (WikiCFP, ConferenceAlerts)
- **Every 5 min:** batch of 5 within 50s: unenriched rows first (page fetch + extraction), then re-verification of stored rows (deadline within 14 days every 2 days, everything else weekly). DB-backed daily cap of Claude calls shared by both (600 by default; `ENRICHMENT_DAILY_LIMIT` overrides).
