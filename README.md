# Speaking Opportunity Finder

Aggregates speaking opportunities -- CFPs, conferences, podcasts, and meetups -- from 10+ scrapers and live search. Users filter by industry and location, save opportunities, and get AI-enriched details (deadlines, locations, topics) via Anthropic Claude.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, React Router |
| Backend | Express, TypeScript, Prisma ORM |
| Database | SQLite (dev), PostgreSQL (prod) |
| AI | Anthropic Claude SDK (opportunity enrichment) |
| Auth | bcryptjs + JWT |
| Hosting | Vercel |

## Local Development Setup

### Prerequisites

- Node.js 18+
- npm

### Steps

```bash
# Clone and install
git clone <repo-url>
cd speaking-opportunity-finder
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# Set up database
npx prisma db push
npx prisma generate

# Start dev servers (client on :5173, server on :3001)
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `file:./dev.db` | SQLite path (dev) or PostgreSQL connection string (prod) |
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
prisma/          Prisma schema and migrations
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

- **Scrapers** (Sessionize, PaperCall, WikiCFP, Eventbrite, CallingAllPapers, Confs.tech, and more) pull opportunities into the database.
- **Live search** queries the Linkup API at request time and merges real-time results with stored data. Live results display a "Live" badge.
- **Enrichment** runs as a background process. Claude API calls fill in missing deadlines, locations, and topics on stored opportunities.
- **Sync schedule** via Vercel Cron:
  - Daily (6:00 UTC): Fast scrapers -- CallingAllPapers, Sessionize, PaperCall, WikiCFP
  - Weekly (Monday 8:00 UTC): Deep scrapers -- Linkup with 30 industry queries, Eventbrite, etc.
  - Every 5 minutes: Enrichment pass on unenriched opportunities

### Key Files

| File | Purpose |
|------|---------|
| `server/src/services/opportunityService.ts` | Core queries, future-deadline filtering |
| `server/src/services/liveSearchService.ts` | Linkup live search integration |
| `server/src/services/enrichmentService.ts` | Claude-powered enrichment |
| `server/src/scrapers/` | 10+ scraper implementations |
| `client/src/pages/Home.tsx` | Main opportunity grid with unified results |
| `prisma/schema.prisma` | Data model (User, Opportunity, SavedOpportunity) |
| `vercel.json` | Deployment config, routing, cron schedules |

## Deployment

Deployed on Vercel. The `vercel.json` config handles:

- **Build**: Copies production Prisma schema, generates client, builds all workspaces
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
# Unit tests
cd server && npx vitest run

# E2E tests
npx playwright test
```

## Other Useful Commands

```bash
npx prisma studio     # Browse the database visually
npx prisma db push    # Push schema changes to the database
npm run build         # Build all workspaces
```
