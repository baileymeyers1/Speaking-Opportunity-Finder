# Speaking Opportunity Finder

## What It Is
Aggregates speaking opportunities (CFPs, conferences, podcasts, meetups) from multiple scrapers and live search. Users filter by sector/location, save opportunities, and get AI-enriched details.

## Stack
- **Monorepo** with npm workspaces: `client/`, `server/`, `shared/`
- **Client:** React 18 + Vite + TypeScript + Tailwind CSS + React Router
- **Server:** Express + TypeScript + Prisma ORM
- **Database:** PostgreSQL everywhere. Dev: `postgres:16` from `docker-compose.yml` (`docker compose up -d db`, host port 5433). Prod: `DATABASE_URL` set in Vercel. Prisma 7 with the `pg` driver adapter (`@prisma/adapter-pg`); one schema, `prisma/schema.prisma`; the connection string lives in `prisma.config.ts`.
- **AI:** Anthropic Claude SDK 1.x (opportunity enrichment)
- **Auth:** bcryptjs + JWT (custom, no third-party auth)
- **Hosting:** Vercel. Express app runs as one serverless function (`api/index.ts` imports `server/dist/app.js`); Vercel Cron drives syncs and enrichment (`vercel.json`) and is the only scheduler: `server/src/index.ts` only listens. 60s function limit.

## Key Conventions
- Prisma for all DB access through the shared client in `server/src/lib/prisma.ts` (never `new PrismaClient()` in a module). The client is generated into `server/src/generated/prisma` (gitignored; `npx prisma generate`); import `PrismaClient`, `Prisma` and model types from `../generated/prisma/client.js`, never from `@prisma/client`.
- JSON arrays stored as strings (`industries`, `topics` fields); the text search matches words inside the JSON string, so moving them to native arrays is a separate change. `sectors` is a native `String[]`.
- Sectors, not tags, are what the list is filtered and counted by: one or two ids per row from the fixed list in `server/src/lib/sectors.ts` (ids are stored, sent to Claude and written into URLs: never rename one). Claude names them in the extraction; a row it has not read is placed by its tags (`services/sectorMapping.ts`). Free-text `industries` stay for search and the match score. A new sector needs its phrases in `sectorPhrases.ts` and a `searchTerm` that maps back to it (a test checks both).
- Server tests run against the `speaking_finder_test` database (`server/vitest.config.ts` pushes the schema there first); `*.db.test.ts` files hit it for real, everything else mocks `lib/prisma.js`.
- Live search results show "Live" badges; save them via `POST /api/opportunities/save-live`.
- Client uses localStorage caching for instant load while the serverless API cold-starts; it pings the health endpoint on mount.
- Default query filter (`listedConditions` in `opportunityQuery.ts`, mirrored in SQL in `eventContext.ts`): only future-deadline opportunities shown; `isClosed`/`isRelevant` rows never shown; a search hit (`Live Search`, `Linkup Search`) only once its own page was read (`verifiedAt` set, no `verificationError`); no row with no deadline and a past event date. Change the rule in both places.
- Default order is `compareByClosing` (`opportunityQuery.ts`): by deadline, else event date, else 30 days out for a rolling call. It is sorted in memory, so do not reintroduce `orderBy: cfpDeadline` for the default list: that puts every row without a deadline last.
- Browse pages one lane at a time (`services/lanes.ts`): `closing` (open call with a deadline), `open` (open call with none), `watch` (`hasOpenCall` false). `laneOf` (one row) and `laneWhere` (Prisma) say the same thing: change both. `client/src/lib/callState.ts` reads the same states from a row for display. The client always sends `lane`; a request without one lists every lane together. The controller must not re-sort stored rows: the service's order is the order.
- A call in a list is one row, `CallRowFrame` (`components/browse/CallRow.tsx`): a list passes it what the row leads with and its actions. Browse and Saved both do; do not add a second row or a card. Saved lists one stage at a time (`lib/savedStage.ts`, stage in the URL as `stage=`), and an action there takes the row off the list, so it goes through `useRowLeaving` (focus to the list, the change announced).
- An account keeps a roster: several `SpeakerProfile` rows. Every speaker query goes through `services/speakerService.ts` with the account's user id; never look one up by id alone. Rows are scored for every speaker (`scoreForRoster`) and lead with the one asked for (`?speaker=<id>`) or the best fit; the client's choice of person is `useForWhom` (rules in `client/src/lib/forWhom.ts`). Never treat the roster's first speaker as "the user". Fit reasons carry no "you": they are read beside a name.
- A call is saved through `saveCall` and moved (stage or speaker) through `changeSavedCall` (`services/savedCalls.ts`), never a `create`, `update` or `upsert` in a caller: one row per account, call and speaker (no speaker counts as one) is its promise, and no unique constraint backs it (`db push` cannot add one to a table with rows).
- A search hit is only a URL and a snippet; a CFP listing vouches for its rows. Code that treats them differently goes through `services/searchSources.ts` (`isSearchSource`, `isUnreadSearchHit`, `openCallAfterRead`), never a source-name comparison of its own. A calendar lists events, not calls: its source (`CALENDAR_SOURCES`) is a search source, and its rows are written through `persistCalendarResults` (insert only, so it never relabels a row another source holds), never `persistResults`.
- A page is read with its links (`pageLinks.ts`, menus included), and the one extraction may answer only with one of them: `callPageUrl`, `officialUrl`, `listedEvents`. An event page that names its call page has it read in the same read (`services/callFollowing.ts`); the row then applies at `callUrl` and keeps `applyUrl` as its address (rows are found by `applyUrl`: never move it). A listing's official site and a directory's events become `Followed Link` rows (`services/followedLinks.ts`), hidden until read like search hits, read only when robots.txt allows `*` (`services/robots.ts`), and never fanned out a second time. `payToPresent` labels a call where speakers pay; it is a label, never a filter.
- Scraped re-syncs never overwrite Claude-enriched fields or enrichment bookkeeping (`server/src/scrapers/persistData.ts`).
- Enrichment budget and row claims live in the DB (`server/src/services/enrichmentBudget.ts`), not process memory. Verification shares both.
- A page is read through `readPage` in `services/pageReader.ts`, never `fetchPageText` directly from a caller: that is what makes a page readable or not in the same way for the worker, verification and live search.
- All Claude extraction goes through `extraction.ts` (structured outputs, strict schema); never add a second prompt or regex-parse model output.
- Live search persists every hit in the request and matches the hits it read to events; the worker enriches what the request did not and gives each row its event then. Nothing runs after the response on Vercel.
- The functions run in `pdx1` (`regions` in `vercel.json`) because the database is in Render's Oregon region: a query from the default region costs a cross-country round trip. Keep the two together if either moves.
- Dynamic year references throughout -- no hardcoded years.
- The look is the JCI Intelligence kit (`~/projects/jci-brand-kit`; `BRAND.md` there is the reference). Colours come only from the tokens in `client/src/styles/tokens.css`, through the names `tailwind.config.js` gives them: never a Tailwind palette class (`text-emerald-600`), and never `hsl(var(--…))` (the variables hold R G B channels: `rgb(var(--ink))`). Change a token only when the kit changes it.
- Status is an icon plus a word, with the colour on the icon (`Badge` variants `good` / `warning` / `critical`). Red (`primary`) is for the one primary action, focus, the current tab and an urgent deadline: never a data mark, never an inline link (`.link` is ink). Radii: `rounded-lg` sheets (14px), `rounded-md` controls (10px), `rounded-sm` tags (6px); pills only for switches. Emphasis is `font-medium`; nothing is bold, nothing is monospace, copy is sentence case.
- Liquid glass goes only on things that move (today: the theme switch's knob), never on a header, card or panel. `client/src/vendor/jci/liquid-glass.js` is the kit's file byte for byte: update it by copying from the kit, never by editing it. No `opacity`, `filter`, `mask` or `clip-path` on the glass or an ancestor, or it refracts nothing. The classes that script adds at run time (`.lg-surface`, `.lg-lens`, `.lseg__lens`) are styled outside any `@layer` in `styles/jci.css`: the script is kept out of Tailwind's scan, and Tailwind drops a layered rule whose class it cannot find.

## Key Files
- `server/src/services/opportunityService.ts` -- Core queries + future-deadline filter
- `server/src/services/liveSearchService.ts` -- Live search integration
- `server/src/services/extraction.ts` -- The one Claude call (structured outputs) and the merge rules; `pageReader.ts` reads apply pages (`readPage`: our fetch in `pageText.ts`, then Linkup's fetch endpoint when that is refused)
- `server/src/lib/sectors.ts` -- The fixed sector list (also read by the client); `services/sectorMapping.ts` + `sectorPhrases.ts` + `sectorBroadWords.ts` -- tags to sectors without a model call; `scripts/backfillSectors.ts` -- one-off for stored rows
- `server/src/services/enrichmentService.ts` -- Enrichment of a row via extraction; `backgroundEnrichment.ts` -- cron worker (enrich, then verify)
- `server/src/services/verification.ts` -- Which stored rows are re-verified when, and what a check or an enrichment writes; `searchSources.ts` -- search hits versus listed calls
- `server/src/scrapers/index.ts` -- Scraper registry, per-scraper runs with time budget, persistence
- `server/src/scrapers/` -- confs.tech, javaconferences, callingallpapers, developers.events, pretalx (hosted API + CFP pages), sessionize (public event pages via the events sitemap), ruralhealthinfo (health events with an open call for presentations), radioguestlist (podcast guest requests, RSS), a Linkup slice, The Trade Show Calendar and Civic Tech Field Guide (daily); WikiCFP, ConferenceAlerts, WDO (weekly). `scrapers/calendars/` holds the calendar readers (`common.ts`: `toScraperResult`, `worthReading`, `persistCalendarResults`; `eventsCalendar.ts` serves any site on The Events Calendar's JSON API). `linkupQueries.ts` holds the Linkup query set, each entry with its `format`; `services/searchLog.ts` promotes frequent live-search queries into the daily Linkup run
- `client/src/pages/Home.tsx` -- Browse: two rows of controls (tools; lanes, caption and sort), then the rows (live and stored results in one list). No visible headline: keep the top of the page to the controls it needs
- `client/src/components/browse/` -- `LaneSwitch`, `LaneCaption`, `SortSelect`, `SectorMenu`, `CallList`, `CallRow` (with `CallRowFrame` and `ApplyLink`), `Countdown`, `LeadFigure`; `client/src/components/SegmentedSwitch.tsx` (the glass segmented control behind the lanes and the Saved stages); `client/src/components/FilterPanel.tsx` (search with live search inside it, sectors, filters); `client/src/lib/laneCaption.ts` (the line beside the lanes) and `lib/callState.ts` (where a call stands); `server/src/services/lanes.ts` -- the three lanes, their order and the summary every list response carries
- `client/src/pages/OpportunityDetail.tsx` -- the call page: title, `components/call/CallStanding` (the one row of action), then the description beside `CallFacts`; `client/src/lib/callStanding.ts` (its wording) and `lib/callDisplay.ts` (organization, place, pay and description wording shared with Browse rows)
- `client/src/pages/SavedOpportunities.tsx` -- Saved: the stage switch with counts, then that stage's calls as Browse's rows; `components/saved/` (`SavedCallRow`, `StageMenu`), `lib/savedStage.ts` (the stages, the order within one, the caption), `hooks/useRowLeaving.ts` (focus and the announcement when a row leaves the list)
- `client/src/styles/tokens.css` -- JCI colours, radii and motion for both themes; `styles/jci.css` -- the button fill, `.field`, the glass bezel, the theme reveal; `client/tailwind.config.js` -- maps shadcn names onto the tokens
- `client/src/components/Navbar.tsx` with `Lockup`, `NavTabs` (the red rule) and `ThemeSwitch` (glass knob + view-transition reveal); `client/src/lib/motion.ts` (frame loop, `Spring`), `lib/glass.ts`, `lib/themeReveal.ts`
- `server/src/services/speakerService.ts` -- the roster behind `/api/speakers`; `services/savedCalls.ts` -- the one way a call is saved; `client/src/pages/Speakers.tsx` and `SpeakerDetail.tsx` (`components/speakers/`, `components/profile/ProfileForm.tsx`, `hooks/useSpeakers.ts`, `lib/speakerDisplay.ts`); `client/src/lib/forWhom.ts` + `hooks/useForWhom.ts` + `components/ForWhomSelect.tsx` -- whose fit and whose saved calls a list shows; `server/src/scripts/assignSavedCalls.ts` -- one-off for calls saved before the roster
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
- **Every 5 min:** up to 15 rows, three at a time, none started after 35s: unenriched rows first, a live search's leftovers before anything else (page fetch + extraction), then re-verification of stored rows (deadline within 14 days every 2 days, everything else weekly). DB-backed daily cap of Claude calls shared by both (600 by default; `ENRICHMENT_DAILY_LIMIT` overrides), and one of reader calls (300; `PAGE_READER_DAILY_LIMIT`, 0 turns the reader off).
