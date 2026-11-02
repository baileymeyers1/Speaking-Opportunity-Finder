# Speaking Opportunity Finder - Assessment & Plan

## Current State Assessment

The app is a React + Express + Prisma monorepo deployed on Render (free tier). It has 3 data scrapers (confs.tech, javaconferences.org, Linkup CFP discovery), JWT auth, saved/bookmarked opportunities, and a filter system. The foundation is solid but several issues hurt usability.

---

## Problem Analysis

### Problem 1: Slow Database Load / Empty Results on Open

**Root Causes:**
- **Render free tier cold starts**: The backend spins down after 15 min of inactivity. Cold start takes 30-50 seconds. During this time the frontend shows nothing.
- **No loading skeleton or cached data**: The frontend shows a blank grid while waiting.
- **No default deadline filter**: The `getOpportunities` query fetches ALL records including expired ones, which can return stale data and waste query time.
- **Auto-sync blocks nothing but runs on a 5-second delay after server start**: If the DB is empty on first deploy, results won't appear until the sync completes (which itself involves many HTTP requests to scrapers).

**Current behavior**: User opens app -> sees loading spinner -> Render cold starts backend -> eventually results load (or the request times out).

### Problem 2: Past-Deadline Opportunities Showing

**Root Causes:**
- Cleanup only runs during `syncOpportunities()`, which executes every 24 hours.
- Even the cleanup has a 7-day grace period (only removes deadlines >7 days past).
- The default query in `opportunityService.getOpportunities()` has NO `cfpDeadline >= now()` filter. It serves every record in the database regardless of deadline status.
- Some scraped opportunities have `cfpDeadline: null` (especially from Linkup) - these never get cleaned up.

### Problem 3: Filter UI Takes Too Much Space

**Root Causes:**
- Location and Industry filters render as flat checkbox lists inside the expanded filter panel.
- With many locations/industries, these lists grow large (max-h-32/max-h-40 with overflow scroll, but still visually heavy).
- Each checkbox + label takes a full row of horizontal space in the flex-wrap layout.

### Problem 4: Live Search Results Are Second-Class Citizens

**Root Causes:**
- `LiveSearchResult` is a separate, minimal type: `{title, organization, description, url, source}` - no industries, format, deadline, location, or ID.
- Live results are rendered inline in `Home.tsx` with completely different markup from `OpportunityCard`.
- No save/bookmark button on live results because they aren't `Opportunity` records in the DB.
- Live results and stored results are displayed in separate sections, not interleaved.
- No tagging (industries, format) applied to live results even though the search context could inform this.

---

## Proposed Solutions

### Solution 1: Fast Initial Load

1. **Add `cfpDeadline >= now()` as a default query filter** in `opportunityService.getOpportunities()`. This immediately eliminates expired entries from all queries without waiting for cleanup.
2. **Add a loading skeleton UI** to `OpportunityList` so the page feels responsive during cold starts.
3. **Cache the last successful response in localStorage** on the client. On page load, show cached data immediately, then replace with fresh data when the API responds. This eliminates the "empty page" problem entirely.
4. **Add a server health/warmup ping** on app mount that fires before the main data request, so the Render instance starts waking up immediately.
5. **Consider a seed endpoint or pre-populated database** so even the first load after a fresh deploy has data.

### Solution 2: Enforce Future Deadlines

1. **Server-side**: Add a mandatory `cfpDeadline >= today` filter to the default opportunities query. Opportunities with `cfpDeadline: null` should still be included (they may be ongoing/rolling CFPs) but clearly marked.
2. **Sync cleanup**: Tighten the grace period from 7 days to 0 days (past deadline = removed on next sync, except manual entries).
3. **Scraper-level**: Both existing scrapers already filter by deadline at scrape time, but Linkup results often have `cfpDeadline: undefined`. Add date extraction from Linkup result content to catch deadlines where possible.
4. **Frontend**: Add visual indicators for deadline proximity (e.g., "Closes in 3 days" badge in red/yellow).

### Solution 3: Weekly Cross-Industry Deep Scrape

1. **Add new data sources** beyond the current 3:
   - **Sessionize** - Major CFP platform (scrape their public listings page)
   - **PaperCall** - Another major CFP platform (scrape open CFPs)
   - **CFP Land** - Curated CFP newsletter archive
   - **CallingAllPapers API** - REST API for CFPs (`callingallpapers.com/api/v1/cfp`)
   - **Conferencemonkey.org** - Academic and professional conferences
   - **WikiCFP** - Academic call for papers
2. **Restructure sync schedule**:
   - **Daily quick sync** (existing): confs.tech + javaconferences.org (fast, structured APIs)
   - **Weekly deep scrape** (new): All Linkup queries + new scraper sources. Run once per week (e.g., Sunday midnight UTC) since these are slower and more API-intensive.
3. **Expand Linkup industry queries** to cover more sectors: nonprofit, government, biotech, automotive, aerospace, food/beverage, sports, fashion, architecture, telecom.
4. **Add scraper status tracking** in the database so you can see when each scraper last ran and what it found.

### Solution 4: Filter UI Cleanup

1. **Replace checkbox lists with multi-select dropdown components** for Location and Industry.
2. Each dropdown shows selected count as a badge, opens to reveal a searchable list with checkboxes inside.
3. Selected items appear as dismissable chips/tags below the dropdown.
4. Keep Format and Compensation Type as inline checkboxes (small fixed sets, 4-7 items each).
5. This collapses the filter panel height significantly.

### Solution 5: Unified Live + Stored Results

1. **Promote `LiveSearchResult` to full `Opportunity` type**: When live search returns results, transform them into `Opportunity` objects on the server with:
   - Generated temporary ID (prefixed with `live-` to distinguish)
   - Industries inferred from the search query/context
   - Format defaulting to `conference` (or inferred from content)
   - Source set to `"Live Search"`
   - `cfpDeadline` extracted from content if possible
2. **Add a "Save to Database" action on live results**: When a user clicks save on a live result, persist it as a real `Opportunity` record (source: `"Live Search"`) and then create the `SavedOpportunity` link.
3. **Merge results in a single list**: Instead of two separate sections, combine live and stored results in one grid. Add a visual indicator badge ("Live" in green vs "Stored" in blue) to each card.
4. **Tag live results**: Pass the search industries through to the live search response. Attempt to extract format, location, and deadline from the result content using keyword matching.
5. **Deduplicate**: Before displaying, check if any live result URL matches an existing stored opportunity. If so, show the stored version (richer data) and skip the live duplicate.

---

## Architecture Changes Summary

```
Current:
  Client -> API -> DB (stored results only)
  Client -> API -> Linkup (live results, separate display)

Proposed:
  Client -> API -> DB (default: future deadlines only, cached on client)
  Client -> API -> Linkup + Scraper Sources (live results -> Opportunity format)
  Client displays unified list with source badges
  Weekly cron -> Deep scrape (6-8 sources) -> DB
  Daily cron -> Quick sync (2 sources) -> DB
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Linkup API rate limits on weekly deep scrape | Stagger requests with delays, respect rate limits |
| New scraper sources may change HTML structure | Add error handling per scraper, log failures, don't block other scrapers |
| localStorage cache showing very stale data | Show "last updated" timestamp, auto-expire cache after 24h |
| Render free tier spin-down still causes slow first load | localStorage cache provides instant results regardless |
| Live-to-stored conversion may create duplicates | Deduplicate by URL before insert |
