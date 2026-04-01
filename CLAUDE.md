# Speaking Opportunity Finder

## What It Is
Aggregates speaking opportunities (CFPs, conferences, podcasts, meetups) from multiple scrapers and live search. Users filter by industry/location, save opportunities, and get AI-enriched details.

## Stack
- **Monorepo** with npm workspaces: `client/`, `server/`, `shared/`
- **Client:** React 18 + Vite + TypeScript + Tailwind CSS + React Router
- **Server:** Express + TypeScript + Prisma ORM
- **Database:** SQLite (dev), PostgreSQL (prod via Render)
- **AI:** Anthropic Claude SDK (opportunity enrichment)
- **Auth:** bcryptjs + JWT (custom, no third-party auth)
- **Hosting:** Render free tier (see `render.yaml`)

## Key Conventions
- Prisma for all DB access. Production uses `schema.production.prisma` (copied at build time on Render).
- JSON arrays stored as strings in SQLite (`industries`, `topics` fields).
- Live search results show "Live" badges; save them via `POST /api/opportunities/save-live`.
- Client uses localStorage caching for instant load on cold starts (Render free tier sleeps).
- App pings health endpoint on mount to wake Render.
- Default query filter: only future-deadline opportunities shown.
- Dynamic year references throughout -- no hardcoded years.

## Key Files
- `server/src/services/opportunityService.ts` -- Core queries + future-deadline filter
- `server/src/services/liveSearchService.ts` -- Live search integration
- `server/src/services/enrichmentService.ts` -- Claude-powered enrichment
- `server/src/scrapers/` -- 10+ scrapers (Sessionize, PaperCall, WikiCFP, Eventbrite, etc.)
- `client/src/pages/Home.tsx` -- Main grid with unified live+stored results
- `client/src/components/` -- OpportunityCard (deadline badges), MultiSelectDropdown
- `prisma/schema.prisma` -- Data model (User, Opportunity, SavedOpportunity)
- `render.yaml` -- Render deployment config

## Build & Dev
```bash
npm run dev          # Starts client + server concurrently
npm run build        # Builds all workspaces
npx prisma studio    # Browse DB
npx prisma db push   # Push schema changes
```

## Deployment
Render free tier via `render.yaml`. Push to main auto-deploys.

## Sync Schedule
- **Daily:** Fast scrapers (CallingAllPapers, Sessionize, PaperCall, WikiCFP)
- **Weekly:** Deep scrapers (Linkup with 30 industry queries, Eventbrite, etc.)
