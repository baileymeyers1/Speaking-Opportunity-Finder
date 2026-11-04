# Speaking Opportunity Finder

Aggregates speaking opportunities -- CFPs, conferences, podcasts, and meetups -- from structured scrapers and Linkup live search. Users filter by industry and location, save opportunities, and get AI-enriched details (deadlines, locations, topics) via Anthropic Claude.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, React Router |
| Backend | Express, TypeScript, Prisma ORM |
| Database | PostgreSQL (Docker locally, Vercel-managed in prod), Prisma 7 with the `pg` driver adapter |
| AI | Anthropic Claude SDK 1.x (opportunity enrichment) |
| Auth | bcryptjs + JWT |
| Hosting | Vercel |

## Local Development Setup

### Prerequisites

- Node.js 20.19+ (Prisma 7 requires it; 24 is what the project is developed on)
- npm
- Docker (for the local Postgres)

### Steps

```bash
# Clone and install
git clone <repo-url>
cd speaking-opportunity-finder
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# Start Postgres (creates the speaking_finder and speaking_finder_test databases)
docker compose up -d db

# Generate the Prisma client and create the tables
npx prisma generate
npx prisma db push

# Start dev servers (client on :5173, server on :3001)
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5433/speaking_finder` | PostgreSQL connection string (the Docker database locally, the managed one in prod) |
| `TEST_DATABASE_URL` | No | `…localhost:5433/speaking_finder_test` | Database the server test suite pushes the schema into and runs against |
| `JWT_SECRET` | Prod | `your-super-secret-...` | Secret for signing JWTs. Must change in production. |
| `JWT_EXPIRES_IN` | No | `7d` | JWT token lifetime |
| `PORT` | No | `3001` | Server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin (frontend URL) |
| `VITE_API_URL` | No | `http://localhost:3001/api` | API base URL for the client |
| `ANTHROPIC_API_KEY` | No | -- | Enables AI enrichment of opportunities |
| `WEB_SEARCH_API_KEY` | No | -- | Linkup API key for live search and CFP discovery |
| `CRON_SECRET` | Prod | -- | Authenticates Vercel cron job requests |
| `ENABLE_AUTO_SYNC` | No | `false` | Enable periodic scraper sync on server start |

## Architecture

### Monorepo Structure

```
client/          React frontend (Vite)
server/          Express API server
shared/          Shared TypeScript types
prisma/          Prisma schema and seed (prisma.config.ts at the root points the CLI at it)
api/             Vercel serverless functions + cron handlers
```

### Data Flow

```
Scrapers (10+) --> Prisma DB --> REST API --> React Frontend
                                    ^
Linkup API ---- live search --------+
                                    |
Claude API ---- enrichment ---------+
```

- **Scrapers** (confs.tech, javaconferences, callingallpapers, developers.events, WikiCFP, ConferenceAlerts, Linkup) pull opportunities into the database. Each run is recorded in `ScraperRun`.
- **Live search** queries the Linkup API at request time and merges real-time results with stored data. Live results display a "Live" badge.
- **Enrichment** runs as a background process. Claude API calls fill in missing deadlines, locations, and topics on stored opportunities.
- **Sync schedule** via Vercel Cron:
  - Daily (6:00 UTC): structured scrapers, least-recently-run first, within a 50s budget
  - Weekly (Monday 8:00 UTC): slower sources (WikiCFP, ConferenceAlerts)
  - Every 5 minutes: Enrichment pass on unenriched opportunities

### Key Files

| File | Purpose |
|------|---------|
| `server/src/services/opportunityService.ts` | Core queries, future-deadline filtering |
| `server/src/services/liveSearchService.ts` | Linkup live search integration |
| `server/src/services/enrichmentService.ts` | Claude-powered enrichment |
| `server/src/scrapers/` | Scraper registry (`index.ts`) and implementations |
| `client/src/pages/Home.tsx` | Main opportunity grid with unified results |
| `prisma/schema.prisma` | Data model (User, Opportunity, SavedOpportunity, SavedSearch, EnrichmentUsage, ScraperRun, SearchLog, SpeakerProfile) |
| `server/src/lib/prisma.ts` | The one PrismaClient, built on the `pg` driver adapter; import the generated client from `server/src/generated/prisma` |
| `vercel.json` | Deployment config, routing, cron schedules |

## Deployment

Deployed on Vercel. The `vercel.json` config handles:

- **Build**: Generates the Prisma client, pushes schema changes to `DATABASE_URL`, builds all workspaces
- **Routing**: `/api/*` routes to serverless functions; everything else serves the SPA
- **Cron jobs**: Daily sync, weekly deep sync, and enrichment runs on schedule

To deploy:

1. Connect the repo to Vercel
2. Set all production environment variables in the Vercel dashboard (`DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, etc.)
3. Push to `main` to trigger auto-deploy

## Admin Access

Promote a registered user to admin:

```bash
cd server && npm run promote-admin your@email.com
```

## Testing

```bash
# Unit tests (the server suite needs the Docker Postgres: it pushes the schema
# into speaking_finder_test first and the *.db.test.ts files query it)
cd server && npx vitest run
cd client && npx vitest run

# E2E tests
npx playwright test
```

## Other Useful Commands

```bash
docker compose up -d db   # Start the local Postgres
npx prisma generate       # Regenerate the client after a schema change
npx prisma studio         # Browse the database visually
npx prisma db push        # Push schema changes to the database
npm run build             # Build all workspaces
```
