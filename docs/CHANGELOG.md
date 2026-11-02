# Changelog

Reverse chronological. Current state lives in `docs/STATUS.md`.

## 2026-11-02 — Verified listings, one structured extraction, fast live search

- **One extraction module.** `services/extraction.ts` owns the single Claude call: structured outputs (`output_config.format` with a strict JSON schema; verified against the API on `claude-haiku-5-5` with SDK 0.74) return `{ eventDate, cfpDeadline, location, isRemote, isClosed, isRelevant, compensationType, compensationAmount, format, industries, cleanTitle, cleanOrganization, confidence }`. The prompt includes today's date; the text block is found with `find`; `stop_reason` is checked. `mergeExtraction` is the one set of merge rules (extracted values overwrite, nulls keep existing, a past deadline closes the row, confidence is exposed). Replaces `buildEnrichmentPrompt`/`parseEnrichmentResponse` and `extractMetadataWithClaude`/`mergeClaudeMetadata` and their regex JSON parsing; live results carry `isClosed`/`isRelevant` instead of a fake 2020 deadline.
- **Page fetch in the worker.** `services/pageText.ts` (shared with live search) fetches `applyUrl` with an 8s timeout and returns 5000 chars of visible text. The worker extracts from the page; a 404/410 marks `isClosed` without a Claude call; a short description no longer skips a row whose page was fetched. `processNextBatch` takes a time budget (50s from the cron).
- **Scheduled verification.** New columns `verifiedAt`, `verificationError`, `dateConfidence` (both schema files). When no unenriched rows remain, the enrichment cron re-verifies: deadlines within 14 days not checked in 2 days, then any visible row not checked in 7 days. Reuses the page fetch + extraction, updates dates/location/`isClosed`, counts against the same daily budget. Enrichment from a fetched page also stamps `verifiedAt`. `services/verification.ts` holds the windows, candidate queries and update builders.
- **Live search returns fast.** Dedupe by URL before any enrichment, one Linkup page per variant, top 8 enriched synchronously, every hit persisted in the request (`source: 'Live Search'`, unenriched ones with `enrichmentStatus: null`). The fire-and-forget `autoSaveLiveResults` second Claude pass is gone from both controller call sites. Measured live: 15 results in 10.6s.
- **Client.** "Verified Xd ago" on `OpportunityCard` and `OpportunityDetail`; low-confidence dates render as "~Dec 1, 2026" with a tooltip. Types gain `verifiedAt`, `verificationError`, `dateConfidence`, `isClosed`.
- Tests: server 159 → 187 (extraction, pageText, enrichment plan, verification, live persistence); client +8. Removed the regex-parsing tests they replace.

## 2026-11-02 — Ingestion consolidated; Vercel settled as the deploy target

- **Scraper registry and per-scraper runs.** `scrapers/index.ts` now holds a `SCRAPERS` registry (name, cadence, run). `syncOpportunities(mode, { timeBudgetMs, only })` runs sources least-recently-run first, wraps each in a timeout, persists each scraper's rows before starting the next, and records every run in a new `ScraperRun` table. Cron routes pass a 50s budget to fit Vercel's 60s limit; the admin sync route accepts `?scraper=name`. New `GET /api/admin/analytics/scraper-runs`.
- **Linkup runs a rotating slice.** `scrapeLinkupCFPs(apiKey, { offset, maxQueries })`; the daily run takes 6 of the ~90 queries by date rotation instead of all of them sequentially.
- **Dead scrapers removed:** eventbrite (endpoint retired), linkedinEvents (stub), airtableEvents (never configured), usMegaEvents / pacEvents / prNewsOnline (returned 0 rows by construction and were not CFP sources), papercall (domain no longer resolves). conferenceAlerts, developersEvents and wikicfp repaired with a shared `scrapers/lib/html.ts` and fixture tests.
- **URL normalization keeps identifying query params** and strips only tracking ones, sorted; WikiCFP rows no longer collapse to one record.
- **Quality rescoring is scoped** to rows touched by the run instead of the whole table on every sync.
- **One Prisma client** (`server/src/lib/prisma.ts`) replaces eleven per-module instances.
- **Search is case-insensitive on Postgres** (`mode: 'insensitive'`), and the industry filter matches the quoted JSON token so "ai" no longer matches "retail".
- **Vercel is the only deploy target.** `render.yaml` deleted; CLAUDE.md and README rewritten for Vercel; root planning docs moved to `docs/archive/`. The build command now runs `prisma db push`.
- Year constants computed at call time in confstech, linkupcfp and liveSearchService.

## 2026-11-02 — P0 data-integrity fixes in sync and enrichment

- **Re-scrapes no longer wipe enrichment.** `persistResults` built one `data` object for create and update that set `enrichmentStatus/enrichedAt/enrichmentError` to `null`, so every daily sync re-queued every enriched row and overwrote Claude's cleaned title, organization, dates and location. New `scrapers/persistData.ts` builds update data that never includes enrichment bookkeeping and preserves enriched values, filling only gaps. Cross-source dedup no longer overwrites a row's `applyUrl`.
- **Cleanup no longer deletes saved rows.** `cleanupExpired` excluded nothing; on Postgres the cascade removed users' `SavedOpportunity` rows, on SQLite it threw and aborted the sync. Both delete queries now require `savedBy: { none: {} }`.
- **Closed / irrelevant flags persist.** Enrichment used to set `qualityScore: 0`, which `recalculateAllQualityScores` undid on the next sync. Added `isClosed` and `isRelevant` columns; `computeQualityScore` returns 0 when either is set; browse filters on them explicitly.
- **Enrichment budget and locking moved to the DB.** New `EnrichmentUsage` table (per UTC day) and `enrichmentClaimedAt` / `enrichmentAttempts` columns. Slots are reserved before the API call (failures are billed too); rows are claimed with an optimistic update; failed attempts retry up to 3 times before being marked `failed`. New module `services/enrichmentBudget.ts`.
- **Claude call fixes.** Default model `claude-haiku-4-5-20251001` → `claude-haiku-5-5` (10x cheaper per token); `max_tokens` 256 → 2048 with `stop_reason === 'max_tokens'` treated as a retryable failure; the text block is located with `find` instead of `content[0]` (which may be a thinking block on current models); `output_config.effort: 'low'`; client gets `timeout` and `maxRetries`; prompt includes today's date and computed example years.
- Moved `ScraperResult` and `computeQualityScore` to `scrapers/qualityScore.ts` (re-exported from `scrapers/index.ts`). Dev Prisma schema aligned with production (cascades, `compensationType` index).
- Tests: +18 (persistData merge rules, quality flags, budget helpers); removed a placeholder test that tested `Date.toDateString`.
