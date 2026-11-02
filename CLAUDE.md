# Speaking Opportunity Finder

## What It Is
Aggregates speaking opportunities (CFPs, conferences, podcasts, meetups) from multiple scrapers and live search. Users filter by industry/location, save opportunities, and get AI-enriched details.

## Stack
- **Monorepo** with npm workspaces: `client/`, `server/`, `shared/`
- **Client:** React 18 + Vite + TypeScript + Tailwind CSS + React Router
- **Server:** Express + TypeScript + Prisma ORM
- **Database:** SQLite (dev), PostgreSQL (prod; `DATABASE_URL` set in Vercel)
- **AI:** Anthropic Claude SDK (opportunity enrichment)
- **Auth:** bcryptjs + JWT (custom, no third-party auth)
- **Hosting:** Vercel. Express app runs as one serverless function (`api/index.ts` imports `server/dist/app.js`); Vercel Cron drives syncs and enrichment (`vercel.json`). 60s function limit.

## Key Conventions
- Prisma for all DB access through the shared client in `server/src/lib/prisma.ts` (never `new PrismaClient()` in a module). Production uses `schema.production.prisma`, copied and pushed at build time; keep both schema files identical except for `provider`.
- JSON arrays stored as strings in SQLite (`industries`, `topics` fields).
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
- `server/src/scrapers/` -- confs.tech, javaconferences, callingallpapers, developers.events and a Linkup slice (daily); WikiCFP, ConferenceAlerts (weekly)
- `client/src/pages/Home.tsx` -- Main grid with unified live+stored results
- `client/src/components/` -- OpportunityCard (deadline badges), MultiSelectDropdown
- `prisma/schema.prisma` -- Data model (User, Opportunity, SavedOpportunity, SavedSearch, EnrichmentUsage, ScraperRun)
- `vercel.json` -- Build, routing and cron schedules
- `docs/STATUS.md` -- Current state and deploy gotchas; `docs/plans/2026-11-02-architecture-review.md` -- full review

## Build & Dev
```bash
npm run dev          # Starts client + server concurrently
npm run build        # Builds all workspaces
npx prisma studio    # Browse DB
npx prisma db push   # Push schema changes
```

## Deployment
Vercel. Push to main auto-deploys; the build copies the production schema and runs `prisma db push`. Env vars live in the Vercel dashboard (`DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `WEB_SEARCH_API_KEY`).

## Sync Schedule (Vercel Cron)
- **Daily 06:00 UTC:** structured scrapers, least-recently-run first, within a 50s budget
- **Weekly Mon 08:00 UTC:** slower sources (WikiCFP, ConferenceAlerts)
- **Every 5 min:** batch of 5 within 50s: unenriched rows first (page fetch + extraction), then re-verification of stored rows (deadline within 14 days every 2 days, everything else weekly). DB-backed daily cap of 200 Claude calls shared by both.
