# Public demo

A rebranded copy of the finder for Bailey's portfolio, at speaking-demo.baileymeyers.com (Vercel project
`speaking-demo`, deployed by `scripts/deploy-demo.sh` from the `feature/demo-mode` branch). It is switched on by
`DEMO_MODE=true` (server) and `VITE_DEMO_MODE=true` (client build); production never sets either.

## What it does
- **Listings:** a copy of production's public list (`server/src/demo/listings.ts`), read from production's public
  API, so the demo never touches production's database. Rows keep production's ids. Filled at every deploy
  (`server/dist/scripts/demoRefreshListings.js` in the build) and daily by `/api/cron/demo-listings`. Calls
  production no longer lists are removed; the demo's own live-search hits are kept for two days.
- **Visits:** "Enter the demo" (`POST /api/auth/demo`, `server/src/demo/visitors.ts`) makes an account for that visit
  with a roster of three fictional speakers and two saved calls, signed in for two hours. Accounts are deleted an
  hour after that. Nobody sees anyone else's account.
- **Live search:** runs on production's Linkup and Claude keys, capped at `DEMO_LIVE_SEARCH_DAILY_LIMIT` (25) searches
  a day across the whole demo (`server/src/demo/searchBudget.ts`, counted in the demo database). Responses carry
  `demoLiveSearchLimitReached` / `demoLiveSearchesLeft`. Hits stay in the demo database.
- **Switched off** (404): password sign-in, sign-up, password reset, sync, admin, and the scraper and enrichment crons
  (`server/src/demo/routes.ts`). The demo's only cron is the listings refresh.

## Database
The demo's own Postgres: the Neon store `portfolio-demos`, connected to `speaking-demo` with the `DEMO` prefix, shared
with the other demos. Its tables live in the `speaking_demo` schema: the pool sets `search_path` and Prisma's adapter
gets `schema` (`server/src/lib/prisma.ts`), and the build's `prisma db push` targets it through
`scripts/demo-schema-url.mjs`. It never reads `DATABASE_URL`. Functions run in `iad1`, next to that database.

## Local run
```bash
docker exec speaking-finder-db createdb -U postgres speaking_demo_local
export DEMO_DATABASE_URL_UNPOOLED=postgresql://postgres:postgres@localhost:5433/speaking_demo_local
DATABASE_URL="$(node scripts/demo-schema-url.mjs)" npx prisma db push
npm run build -w server && DEMO_MODE=true node server/dist/scripts/demoRefreshListings.js
DEMO_MODE=true JWT_SECRET=local CRON_SECRET=local node server/dist/index.js   # API on :3001
VITE_DEMO_MODE=true npm run dev -w client
```
