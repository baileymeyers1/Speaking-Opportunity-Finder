# Architecture Review — 2026-11-02

Read-only review of the whole app after a seven-month gap (last commit 2026-04-01). Typecheck is clean, all 110 server and 2 client unit tests pass. Every finding below was verified against the code; file:line references are to the current `main`.

## Executive summary

The app is in a "many patches, one direction" state. The last ~40 commits all tune live search, while the ingestion pipeline underneath it is mostly dead and actively corrupting its own data. The biggest wins are not new features but deleting what doesn't work and fixing four data-integrity bugs.

**Recommendation: consolidate, don't expand.** The product that actually works today is: 3 structured scrapers (confs.tech, javaconferences, callingallpapers) + Linkup search + Claude extraction + Postgres + a React grid. Design for that and remove everything else.

Ordered priorities:

1. Decide the deployment target (Vercel vs Render) and make the repo say one thing.
2. Stop the data corruption and cost leak in the sync/enrichment loop (P0 items below).
3. Delete the dead scrapers; fix the shared HTML helper; add fixture tests.
4. Restructure live search as "store fast, enrich async" so it fits a 60s serverless function.
5. Client: adopt a data-fetching layer and make the URL the single filter state.
6. Fill or delete the template docs; update CLAUDE.md.

---

## 0. Deployment and docs are contradictory

| Source | Says |
|---|---|
| `CLAUDE.md`, `render.yaml`, `docs/database-strategy.md` | Hosted on Render free tier |
| `README.md`, `vercel.json`, `api/index.ts`, `.vercel/project.json`, plan `2026-03-25-final-product.md` | Migrated to Vercel serverless + Vercel Cron |

`server/src/index.ts` still carries the long-running-process scheduler (setInterval syncs) for Render; `api/index.ts` imports `server/dist/app.js` for Vercel. Both paths are live in the repo.

- `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` are unfilled templates. `AGENTS.md` tells agents to read them first.
- Five planning docs sit at the repo root (`PLAN.md`, `PRD.md`, `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_SUMMARY.md`, `FIXES_APPLIED.md`) and are stale.
- If Render is still live: the static site and API are on different `*.onrender.com` subdomains, which the Public Suffix List treats as cross-site, so the `sameSite: 'lax'` auth cookie (`server/src/controllers/authController.ts:8`) is never sent on API calls. Login appears to work (user set from response) but `/auth/me` on reload and `/saved` fail.

**Do:** confirm Vercel is the live target, delete `render.yaml` and the scheduler branch in `server/src/index.ts`, rewrite `CLAUDE.md`'s Stack/Deployment sections, move root planning docs to `docs/archive/`, and either fill `STATUS.md` (<150 lines) or delete the three templates.

---

## 1. P0 — data corruption and cost leak in the sync loop

### 1.1 Re-scraping wipes Claude enrichment and re-queues the row forever
`server/src/scrapers/index.ts:328-354`. The update path writes the full `data` object including `enrichmentStatus/enrichedAt/enrichmentError: … || null` (345-347). Scraped rows never carry those fields, so every daily sync resets enriched rows to `null`, and the 5-minute enrichment cron pays Claude to enrich them again. It also overwrites cleaned title/org/dates with the raw scraped values.

**Fix:** on update, write only scraped fields; never touch `enrichment*`; prefer existing non-null enriched values when the scraped value is empty. Reset status only if a content hash changed.

### 1.2 `cleanupExpired` hard-deletes saved opportunities
`server/src/scrapers/index.ts:396-406` deletes every non-live row with a past deadline. In production the Postgres schema has `onDelete: Cascade` on `SavedOpportunity`, so users' saves silently vanish. In SQLite dev there is no cascade, so the delete throws an FK error and aborts the sync. `docs/database-strategy.md` says past-deadline rows are kept and shown grayed out; the code contradicts it.

**Fix:** soft-expire (`expiredAt` column or query filter), or exclude rows with saves. Expire on `eventDate` as a fallback for rows without a deadline (currently they live forever, `opportunityService.ts:100-103`).

### 1.3 Closed/irrelevant CFPs resurface every sync
`backgroundEnrichment.ts:148-152` sets `qualityScore: 0` for closed/irrelevant rows, but `recalculateAllQualityScores` (`index.ts:126-171`) runs on every sync and recomputes the score from fields, undoing it.

**Fix:** store `isClosed`/`isRelevant` as columns and filter on them.

### 1.4 Enrichment budget and locking don't exist on serverless
`backgroundEnrichment.ts:8-30`: the 200/day budget is module memory, so it resets on every cold start and each Vercel instance keeps its own count. Only successes are counted; failures are billed too. No claim/lock, so overlapping cron runs can enrich the same row twice. `max_tokens` is 256 (`config/index.ts:45`) and `stop_reason` is unchecked, so truncated JSON is marked `failed` permanently.

**Fix:** budget counter in the DB; set a spend cap in the Anthropic console; claim rows with an `enrichingAt` timestamp before calling Claude; raise `max_tokens` and check `stop_reason`.

### 1.5 Claude model and SDK are a generation behind
- `config/index.ts:44` uses `claude-haiku-4-5-20251001` ($1/$5 per MTok). Current Haiku is `claude-haiku-5-5` at $0.10/$0.50 — a 10x cost reduction for the same extraction workload. Model IDs no longer take date suffixes.
- `@anthropic-ai/sdk` is 0.74; current is 1.3.0 (major). Both call sites build a new client per call (`liveSearchService.ts:794`, `enrichmentService.ts:32`) with no `timeout`/`maxRetries`.
- JSON is extracted by regex from free text (`liveSearchService.ts:802`). Structured outputs (`output_config.format`) would make this deterministic.
- The enrichment prompt has literal 2025/2026 example dates (`enrichmentService.ts:185-186`) and no "today" date, so the model can't tell past from future deadlines. The live-search prompt already does this right (`liveSearchService.ts:765-770`); share one prompt builder.

---

## 2. P1 — most scrapers are dead

Verified by reading code and, where possible, hitting the live endpoints.

| Scraper | State | Evidence |
|---|---|---|
| usMegaEvents, conferenceAlerts, pacEvents, prNewsOnline | **Return ~0 by construction** | Each has a local `stripHtml` that turns tags into `\n`, then `normalizeText` collapses `\s+` (including `\n`) to a space, then the parser does `split('\n')` → one line. Reproduced in node. `usMegaEvents.ts:12-23` and copies. |
| developersEvents | Returns 0 | Interface expects `url/cfpUrl/startDate/cfpEndDate` (`:3-15`); live JSON uses `hyperlink`, `date[]`, `cfp{link,untilDate}`, nested `conf.name`. |
| eventbrite | Dead | `/v3/events/search` returns 404; endpoint was retired. |
| linkedinEvents | Stub | `:10-12` returns `[]`. |
| airtableEvents | Unconfigured | Needs 4 env vars that `.env.example` doesn't mention. |
| wikicfp | Collapses to 1 row | `normalizeUrl` (`index.ts:173-182`) drops the query string; every WikiCFP link is `event.showcfp?eventid=…`. Links also stored with literal `&amp;` (`wikicfp.ts:38`). `urlNormalization.test.ts:13-19` locks in the bug. |
| papercall | Unverified | `events.json` is not a documented endpoint; host didn't resolve during review. |
| Sessionize | **Does not exist** | CLAUDE.md and README list it. |
| confstech, javaconferences, callingallpapers | Working | These are the only structured sources that produce data. |
| linkupcfp | Working but heavy | 89 industry queries × up to 4 pages, sequential, 200ms sleep, no timeout. `page` may not be a real Linkup param. |

Other pipeline problems:

- **Fallback URLs merge unrelated rows:** `conferenceAlerts.ts:103`, `pacEvents.ts:91`, `prNewsOnline.ts:74`, `usMegaEvents.ts:272-273` fall back to the listing page URL, so many rows share one `applyUrl`.
- **Lookup vs dedup mismatch:** DB lookup uses raw `applyUrl` (`index.ts:323`); in-batch dedup uses the normalized form. Cross-source dedup matches on a 10-char org prefix with `contains` (case-sensitive on Postgres) and then **overwrites the matched row's `applyUrl`** (`:376-380`), so two sources flip a row's URL back and forth each sync and users' saved links change.
- **Timezones:** `new Date('YYYY-MM-DD')` is UTC midnight, so a deadline expires the evening before in US timezones. The tested `parseDate` in `dataNormalization.ts:103` is unused; each scraper has its own regex.
- **Hardcoded years:** `liveSearchService.ts:384` (`2024..2030`), `:873` (`2020-01-01` sentinel), `CURRENT_YEAR` computed at module load in `confstech.ts:7` and `linkupcfp.ts:14`, year-specific URL in `prNewsOnline.ts:47`.
- **Copy-paste:** `normalizeText/stripHtml/buildAnchorMap` in 4 files; `extractDeadline` in 6 variants; `extractCompensation` in 3. `ScraperResult` lives in the orchestrator and enrichment fields pass through `as any`.

**Do:**
1. Delete eventbrite, linkedinEvents, airtableEvents. Delete or rewrite the four HTML scrapers only if the sources are worth it (they are conference *listings*, not CFPs, and get `" - Call for Speakers"` appended to titles).
2. Fix `developersEvents` to the real schema; fix `normalizeUrl` to strip only tracking params; decode entities in WikiCFP links.
3. Create `server/src/scrapers/lib/` with: `fetchWithTimeout`, `htmlToLines`, one `parseDate` (end-of-day), `extractCompensation`, and a `Scraper { name, cadence, run() }` registry that records per-run counts to a `ScraperRun` table so dead sources are visible in the admin dashboard.
4. Fixture-based parser test per scraper (saved HTML/JSON in `__fixtures__`). Any of #5/#6 above would have been caught on day one.

---

## 3. P1 — live search is a batch pipeline running inside a user request

`performLiveSearch` (`liveSearchService.ts:547-673`) per request:

1. Builds up to 3 query variants, runs each through `performLinkupSearch` **in parallel**.
2. Each variant fetches up to 3 Linkup pages (150 results), then fetches **up to 50 result pages** at concurrency 6 with an 8s timeout each (worst case ~70s), then sends up to 25 items to Claude in 5 parallel batches.
3. Dedup across variants happens **after** enrichment (`:573-583`), so the same URL can be fetched and Claude-processed three times.
4. The controller then fires `autoSaveLiveResults` **without awaiting** (`opportunitiesController.ts:136-143`), which runs a *second* Claude enrichment pass (`:1112-1117`) and N sequential DB round-trips. On Vercel the function is frozen after the response is sent, so this work is usually killed mid-flight and the "auto-save" silently doesn't happen.

`vercel.json` caps functions at 60s. Worst case per request: 9 Linkup calls, 150 page fetches, 15+ Claude calls, then a fire-and-forget that never completes. This is also why `GET /api/opportunities?liveSearch=true` blocks the browse grid behind the whole pipeline.

Other serverless mismatches:

- **11 `new PrismaClient()` instances** (one per module). On serverless + Postgres this multiplies connection pools per cold start. Use a single `server/src/lib/prisma.ts` with the global-cache pattern; consider Prisma Accelerate, Neon's pooled connection string, or pgbouncer.
- **`express-rate-limit` with the default memory store** (`middleware/rateLimit.ts`) is per-instance, so it limits nothing meaningful on Vercel. Use Vercel's firewall rules or an Upstash store, or drop it.
- **Sync crons can't finish in 60s.** Weekly runs 89 Linkup queries sequentially plus `usMegaEvents` detail fetches; nothing is persisted until every scraper finishes (`index.ts:469`), so a timeout loses the whole run. Daily is borderline (confs.tech does 54 sequential fetches; `recalculateAllQualityScores` scans and updates the whole table row by row).
- **Password reset only logs the token to the console** (`authService.ts:130-132`). There is no email provider, so the forgot-password UI is a dead end in production.

**Do — restructure live search as "store fast, enrich async":**

1. `performLiveSearch` → one Linkup call per variant, dedupe by URL **first**, regex metadata only, return in <5s. Persist immediately with `enrichmentStatus: null` and `source: 'Live Search'`. This also removes the duplicated controller code (`getOpportunities` and `liveSearch` do the same thing twice).
2. Move page-fetch + Claude extraction into the enrichment worker so **one** enrichment path serves both scraped and live rows. The cron already exists; give it the better prompt from live search.
3. Client shows "enriching…" on live cards and refetches once (or polls `updatedAt`). If you want results to look complete instantly, run enrichment for the top ~8 synchronously and defer the rest; keep the request under ~20s.
4. If you must keep post-response work, use `waitUntil` from `@vercel/functions` instead of a dangling promise.
5. One cron route per scraper (or a `?scraper=` param), persist after each, wrap each in `withTimeout`. Recalculate scores only for rows touched in the run.

---

## 4. P1 — query layer bugs

- **Search is case-sensitive in production.** `opportunityService.ts:113-115,129,149` use `contains` without `mode: 'insensitive'`. SQLite's `LIKE` is case-insensitive by default, Postgres's is not, so dev and prod behave differently.
- **Industry filter is a substring match on a JSON string.** `industries: { contains: 'ai' }` matches `["retail"]`. Move industries to a relation table or a Postgres `text[]`.
- **Search loads every match into memory** (`:206-232`) to sort by relevance before paginating. Fine today, won't scale; Postgres full-text (`tsvector`) solves both this and case-sensitivity.
- **Two Prisma schemas** maintained by hand (`schema.prisma` vs `schema.production.prisma`), already drifted (production has `onDelete: Cascade` and an extra index). Run Postgres locally (Docker, or a Neon dev branch) and keep one schema. Prisma 5.22 → 7.x is a major upgrade; do it after consolidating.
- Filter options endpoint (`getUniqueIndustries`) loads the whole table on every call; cache or precompute.

---

## 5. P2 — client

Verified bugs in `client/src/pages/Home.tsx`:

1. **Live-cache restore ignores which search it was for** (`:90-116`). `currentParams` is built but never compared to the cached params, so any live cache under 5 minutes old is restored on `/` with no filters.
2. **Once live results exist, all DB fetches stop** (`:138-152`). Filter, search and "Clear all" only re-sort the stale live set until the user clicks "Clear live results". `handleFiltersChange` never clears it.
3. **No request cancellation.** A slow DB fetch can land after a live search and wipe it; its `finally` turns off `isSearching` while the live request is still running.
4. **Live search uses the previous term** when clicked within the 400ms debounce window (`:277` reads `filters`, fetch sends `debouncedFilters`).
5. **Only 5 of 11 filters are in the URL** (`filtersToParams` `:48-57` drops `isRemote`, compensation, `qualityMin`).
6. `liveResultsCache.ts` is unbounded localStorage with fresh UUIDs per search; once the 5MB quota hits, saves fail silently and detail pages say "no longer cached".
7. `AdminDashboard.tsx:190-205` redirects before auth `isLoading` resolves, so reload bounces to `/login` then `/`.
8. `SavedOpportunities.tsx:44-47,94-97` computes tab counts from a server-filtered list, so other tabs show 0.
9. Dates parsed as UTC midnight render a day early for US users (`OpportunityCard.tsx:52-91`, `OpportunityDetail.tsx:132`).
10. `shared/types.ts` is imported by nothing and has drifted from both client and server.
11. `npm run lint` is broken (no ESLint installed, no config), so `react-hooks/exhaustive-deps` has never run.

**Do:** adopt TanStack Query (`useOpportunities`, `useLiveSearch`, `useSaveOpportunity`) with its persistence plugin replacing the three hand-rolled caches; make the URL the only filter state via one `filters/serialize.ts`; split `Home.tsx` (526), `FilterPanel.tsx` (577), `AdminDashboard.tsx` (799), `OpportunityDetail.tsx` (490), `OpportunityCard.tsx` (395) to meet the 300-line convention; make `shared/` the single source of wire types imported by both sides; install ESLint. Accessibility: collapsed advanced filters remain focusable (`FilterPanel.tsx:386-389`, add `inert`), custom pickers hardcode `bg-white` and put checkboxes in `role="listbox"`, Saved-page actions are hover-only, Sort select has no accessible name.

---

## 6. Tests and dependencies

- 110 server tests pass but cover utilities, not failure modes: nothing tests `persistResults` update semantics (1.1), any scraper against a fixture (2), `cleanupExpired` (1.2), or enrichment merge precedence. `backgroundEnrichment.test.ts` never imports the module. `urlNormalization.test.ts` asserts the WikiCFP-breaking behaviour.
- Client: one hook test. E2E: 4 specs that check elements exist and create real users in the dev DB with no cleanup. A Playwright test with a mocked Linkup response (live search → detail → back → change filter) would have caught client bugs 1–4, which the last three commits kept patching.
- `npm audit`: 15 vulnerabilities (1 critical, 7 high) — `qs` via express 4.22, `source-map-js`. `npm audit fix` covers them. Majors available: Prisma 7, Express 5, Vite 8, React 19, Tailwind 4, Anthropic SDK 1.x. Do Anthropic SDK and Prisma first (cost and correctness); the rest can wait.

---

## Suggested sequence

| Step | Scope | Why first |
|---|---|---|
| 1 | Pick Vercel, delete Render path, fix CLAUDE.md, archive root docs | Everything else depends on knowing the runtime model |
| 2 | Prisma singleton; fix 1.1 persist overwrite; budget in DB; `claude-haiku-5-5`; soft-expire instead of delete; case-insensitive search | Stops data loss and the Claude cost loop; ~1 day |
| 3 | Delete dead scrapers; `scrapers/lib`; fix WikiCFP + developers.events; fixture tests; per-scraper cron with persistence | Makes ingestion honest and observable |
| 4 | Live search → store fast, enrich async; single enrichment path; dedupe before enrich | Fits serverless, removes duplicate Claude passes |
| 5 | Client: TanStack Query, URL-as-state, split large files, shared types, ESLint | Fixes the back-nav bug class for good |
| 6 | Single Postgres schema, Prisma 7, SDK 1.x, `npm audit fix` | Cleanup once behaviour is stable |

Steps 2 and 3 are independent and could run in parallel. Step 4 should wait for 3 (it reuses the enrichment path).
