# Speaking Opportunity Finder - Implementation Plan

This document breaks down every change into concrete, ordered tasks across the codebase.

---

## Phase 1: Fix Past Deadlines & Speed Up Loading

These are the most impactful user-facing issues and should be addressed first.

### 1.1 Server: Default filter to future deadlines only

**File:** `server/src/services/opportunityService.ts`

**Changes:**
- In `getOpportunities()`, add a default WHERE condition: `cfpDeadline >= new Date() OR cfpDeadline IS NULL`
- This ensures every query (with or without filters) only returns opportunities with future deadlines or no deadline set
- Null-deadline entries are included but will be handled on the display side

```
// Add at the top of getOpportunities(), before other filters:
where.OR = [
  { cfpDeadline: { gte: new Date() } },
  { cfpDeadline: null }
];
```

**Rationale:** This is the single most impactful change. One line of Prisma query logic eliminates all expired opportunities from every API response.

### 1.2 Server: Tighten sync cleanup

**File:** `server/src/scrapers/index.ts`

**Changes:**
- Change the expired cleanup from 7-day grace period to 0 days (past deadline = delete on next sync)
- Change `expiredDate.setDate(expiredDate.getDate() - 7)` to `expiredDate = new Date()` (current time)

### 1.3 Client: localStorage result caching

**File:** `client/src/pages/Home.tsx`

**Changes:**
- On successful `fetchOpportunities` response, save `{items, timestamp}` to `localStorage.setItem('cachedOpportunities', ...)`
- On component mount (before API call), check for cached data. If cache exists and is <24h old, display it immediately while the fresh request is in-flight
- When fresh data arrives, replace cached data in state and localStorage
- Add a small "last updated" indicator below the results count

```typescript
// On mount:
const cached = localStorage.getItem('cachedOpportunities');
if (cached) {
  const { items, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
    setOpportunities(items);
    setIsLoading(false); // Show cached data immediately
    setIsStale(true);    // Flag that a refresh is in progress
  }
}
```

### 1.4 Client: Loading skeleton UI

**File:** `client/src/components/OpportunityList.tsx`

**Changes:**
- Replace the current loading state (likely a spinner or blank) with skeleton card placeholders
- Show 6 placeholder cards with pulsing gray rectangles matching the OpportunityCard layout
- This makes the page feel responsive during Render cold starts even without cached data

### 1.5 Client: Health ping on mount

**File:** `client/src/App.tsx` or `client/src/pages/Home.tsx`

**Changes:**
- On app mount, fire a `fetch('/api/health')` call (no await, fire-and-forget)
- This wakes up the Render instance immediately while the UI renders
- The actual data request follows naturally from the component lifecycle

### 1.6 Client: Deadline proximity badges

**File:** `client/src/components/OpportunityCard.tsx`

**Changes:**
- Calculate days until `cfpDeadline` from today
- Add colored badge: red "Closes in X days" (<=3 days), yellow "Closes in X days" (<=7 days), or gray date for others
- If `cfpDeadline` is null, show "Rolling/TBD" in a neutral badge

---

## Phase 2: Filter UI Overhaul

### 2.1 Create MultiSelectDropdown component

**New file:** `client/src/components/MultiSelectDropdown.tsx`

**Behavior:**
- Accepts `options: string[]`, `selected: string[]`, `onChange: (selected: string[]) => void`, `label: string`, `placeholder: string`
- Renders as a button showing `"{label} ({selected.length})"` or `"{label}"` if none selected
- On click, opens a dropdown panel (absolutely positioned) with:
  - Search input at top
  - Scrollable checkbox list (filtered by search)
  - "Clear all" link at bottom
- Selected items shown as small dismissable chips/tags below the button
- Dropdown closes on outside click
- Matches existing Tailwind styling

### 2.2 Refactor FilterPanel to use dropdowns

**File:** `client/src/components/FilterPanel.tsx`

**Changes:**
- Replace the Location checkbox list section with `<MultiSelectDropdown>` using locations data
- Replace the Industry checkbox list section with `<MultiSelectDropdown>` using industries data
- Keep Format checkboxes as-is (only 7 options, manageable inline)
- Keep Compensation Type checkboxes as-is (only 4 options)
- Keep Remote checkbox as standalone
- Keep Compensation Amount sliders as-is
- This reduces the expanded filter panel height by ~60%

### 2.3 Styling consistency

- The dropdowns should use the same border, focus, and hover colors as the existing search input
- Selected chips should be small rounded pills with an "x" button, styled like the existing format badges

---

## Phase 3: Unified Live + Stored Results

### 3.1 Expand LiveSearchResult to match Opportunity shape

**File:** `server/src/services/liveSearchService.ts`

**Changes:**
- Modify `performLiveSearch()` to return enriched results that conform to the `Opportunity` interface
- Add fields: `id` (generate UUID prefixed with `live-`), `industries` (from search query context), `format` (infer from content or default to `conference`), `isRemote` (check for "virtual"/"online"/"remote" keywords), `location` (attempt extraction), `cfpDeadline` (attempt date extraction from content)
- Add a `isLiveResult: boolean` flag to distinguish from stored results

**File:** `shared/types.ts` and `client/src/types/index.ts`

**Changes:**
- Add `isLiveResult?: boolean` and `liveSearchUrl?: string` fields to the `Opportunity` interface
- Remove the separate `LiveSearchResult` type (or keep as internal server type and map to `Opportunity` before sending to client)

### 3.2 Server: Save live result to database endpoint

**File:** `server/src/controllers/opportunitiesController.ts` (or `savedController.ts`)

**New endpoint:** `POST /api/opportunities/save-live`

**Behavior:**
- Accepts a live result object (title, organization, description, url, industries, format, etc.)
- Creates a new `Opportunity` record in the database with `source: "Live Search"`
- Returns the created opportunity (with real database ID)
- Then allows the normal save/bookmark flow to proceed with this new ID

**File:** `server/src/routes/opportunities.ts`

- Add route for the new endpoint

### 3.3 Client: Merge results into unified display

**File:** `client/src/pages/Home.tsx`

**Changes:**
- Instead of rendering live results in a separate section, merge them with stored results into a single array
- Add `isLiveResult: true` flag to live results for badge rendering
- Deduplicate: if a live result URL matches a stored opportunity's `applyUrl`, use the stored version
- Sort merged list: live results first (highlighted), then stored results sorted by deadline
- Remove the separate live results section markup

### 3.4 Client: Update OpportunityCard for live results

**File:** `client/src/components/OpportunityCard.tsx`

**Changes:**
- Add an `isLiveResult` badge (green "Live" pill) when `opportunity.isLiveResult === true`
- For live results, the title links to `opportunity.liveSearchUrl` (external) instead of internal detail page
- Add a "Save" button on live results that calls the new `POST /api/opportunities/save-live` endpoint, then converts the card to a normal stored opportunity
- Show industry tags as small chips on all cards (currently not displayed)

### 3.5 Server: Tag extraction for live results

**File:** `server/src/services/liveSearchService.ts`

**New function:** `extractMetadata(content: string, title: string)`

**Behavior:**
- **Format detection**: Check content for keywords like "podcast", "webinar", "workshop", "meetup", "panel" -> set format accordingly, default to "conference"
- **Location extraction**: Look for patterns like "in [City]", "held in [Location]", common city names
- **Remote detection**: Already exists (check "online"/"virtual"/"remote")
- **Date extraction**: Look for date patterns (e.g., "deadline: March 15", "submit by 2026-04-01", "CFP closes January") using regex. Parse to Date if found.
- **Industry tagging**: Map the search query industries to the result, plus check content for additional industry keywords

---

## Phase 4: Weekly Deep Scrape Expansion

### 4.1 Add new scraper: CallingAllPapers

**New file:** `server/src/scrapers/callingallpapers.ts`

**Source:** `https://api.callingallpapers.com/v1/cfp`

**Implementation:**
- REST API, returns JSON list of CFPs
- Filter by `dateCfpEnd >= today`
- Map fields: name -> title, eventUri -> applyUrl, dateCfpEnd -> cfpDeadline, dateEventStart -> eventDate, tags -> industries
- Set source: `"callingallpapers.com"`

### 4.2 Add new scraper: Sessionize

**New file:** `server/src/scrapers/sessionize.ts`

**Source:** Sessionize public CFP listings page

**Implementation:**
- Scrape the Sessionize public page listing open CFPs (may need to use Linkup or direct HTTP + cheerio)
- Extract: event name, CFP deadline, event dates, location, topics
- Map to ScraperResult format
- Set source: `"sessionize.com"`

### 4.3 Add new scraper: PaperCall

**New file:** `server/src/scrapers/papercall.ts`

**Source:** PaperCall open CFPs page

**Implementation:**
- Scrape PaperCall's public events listing
- Extract event details, CFP deadlines, topics
- Map to ScraperResult format
- Set source: `"papercall.io"`

### 4.4 Add new scraper: WikiCFP

**New file:** `server/src/scrapers/wikicfp.ts`

**Source:** WikiCFP RSS feed or HTML listings

**Implementation:**
- Scrape WikiCFP listings by category
- Filter by deadline >= today
- Map to ScraperResult format
- Set source: `"wikicfp.com"`
- Note: This covers academic conferences - expands beyond tech

### 4.5 Expand Linkup industry queries

**File:** `server/src/scrapers/linkupcfp.ts`

**Changes:**
- Add industry queries for: nonprofit, government/policy, biotech/pharma, automotive, aerospace, food/beverage, sports, fashion/apparel, architecture/construction, telecom, supply chain/logistics, insurance, venture capital/startups
- Update year references from "2025 2026" to dynamic current year + next year
- These additional queries bring in more cross-industry coverage

### 4.6 Restructure sync scheduling

**File:** `server/src/index.ts`

**Changes:**
- **Daily sync** (keep existing 24h interval): Runs `confstech` + `javaconferences` + `callingallpapers` scrapers (fast, structured data sources)
- **Weekly sync** (new): Runs Linkup deep scrape + Sessionize + PaperCall + WikiCFP scrapers (slower, web scraping sources)
- Add a `WEEKLY_SYNC_INTERVAL = 7 * 24 * 60 * 60 * 1000`
- Track day of week and only run weekly scrapers on Sundays (or use modular arithmetic on interval)
- Alternative: Use a simple check - store last weekly sync timestamp in DB or env, only run if >7 days old

**File:** `server/src/scrapers/index.ts`

**Changes:**
- Split `runAllScrapers()` into `runDailyScrapers()` and `runWeeklyScrapers()`
- `runDailyScrapers()`: confstech + javaconferences + callingallpapers
- `runWeeklyScrapers()`: linkupcfp (expanded) + sessionize + papercall + wikicfp
- `syncOpportunities()` accepts a `mode: 'daily' | 'weekly' | 'full'` parameter
- Expired cleanup runs on every sync regardless of mode

### 4.7 Add SyncStatus model

**Files:** `prisma/schema.prisma`, `prisma/schema.production.prisma`

**New model:**
```prisma
model SyncStatus {
  id          String   @id @default(uuid())
  scraperName String   @unique
  lastRunAt   DateTime
  itemsFound  Int
  itemsAdded  Int
  status      String   // 'success' | 'error'
  errorMessage String?
}
```

**Purpose:** Track when each scraper last ran, how many items it found, and whether it succeeded. Useful for debugging and the sync status API endpoint.

### 4.8 Install cheerio for HTML scraping

**File:** `server/package.json`

**Changes:**
- Add `cheerio` as a dependency (needed for Sessionize, PaperCall, WikiCFP scrapers that return HTML)
- Add `@types/cheerio` as dev dependency

---

## Phase 5: Polish & Remaining Items

### 5.1 Update year references

**Files:** `server/src/services/liveSearchService.ts`, `server/src/scrapers/linkupcfp.ts`

**Changes:**
- Replace hardcoded "2025" and "2025 2026" with dynamic `new Date().getFullYear()` and `new Date().getFullYear() + 1`

### 5.2 Add industry tags to OpportunityCard

**File:** `client/src/components/OpportunityCard.tsx`

**Changes:**
- Display `opportunity.industries` as small chips/tags at the bottom of each card
- Limit to first 3 industries with "+N more" if there are many
- Use subtle styling (small gray pills) so they don't overwhelm the card

### 5.3 Add sync status to admin/debug view

**File:** `server/src/controllers/opportunitiesController.ts` (or new sync controller)

**Changes:**
- Enhance `GET /api/sync/status` to return per-scraper status from the SyncStatus model
- Show last run time, items found, success/error for each scraper

### 5.4 Handle null deadlines in display

**File:** `client/src/components/OpportunityCard.tsx`

**Changes:**
- If `cfpDeadline` is null, show "Deadline: TBD" or "Rolling" instead of nothing
- This is important since Linkup-sourced and live search results often lack deadline data

### 5.5 Deduplication improvements

**File:** `server/src/scrapers/index.ts`

**Changes:**
- Normalize URLs before deduplication (strip trailing slashes, query params, www prefix)
- Add title-similarity deduplication as a secondary check (fuzzy match on title + organization to catch same event with different URLs)

---

## Implementation Order

The phases should be executed in order, but within each phase the tasks are largely independent and can be parallelized:

```
Phase 1 (Critical fixes)
├── 1.1 Default future deadline filter  ← DO FIRST
├── 1.2 Tighten sync cleanup
├── 1.3 localStorage caching
├── 1.4 Loading skeleton
├── 1.5 Health ping
└── 1.6 Deadline badges

Phase 2 (UI improvement)
├── 2.1 MultiSelectDropdown component
├── 2.2 Refactor FilterPanel
└── 2.3 Styling

Phase 3 (Feature: unified results)
├── 3.1 Expand LiveSearchResult type
├── 3.2 Save-live endpoint
├── 3.3 Merge results in Home.tsx
├── 3.4 Update OpportunityCard
└── 3.5 Tag extraction

Phase 4 (Feature: more data)
├── 4.1 CallingAllPapers scraper
├── 4.2 Sessionize scraper
├── 4.3 PaperCall scraper
├── 4.4 WikiCFP scraper
├── 4.5 Expand Linkup queries
├── 4.6 Restructure sync scheduling
├── 4.7 SyncStatus model
└── 4.8 Install cheerio

Phase 5 (Polish)
├── 5.1 Dynamic year references
├── 5.2 Industry tags on cards
├── 5.3 Sync status view
├── 5.4 Null deadline display
└── 5.5 Dedup improvements
```

---

## Files Modified (Summary)

| File | Phases | Changes |
|------|--------|---------|
| `server/src/services/opportunityService.ts` | 1 | Default deadline filter |
| `server/src/scrapers/index.ts` | 1, 4 | Tighten cleanup, split daily/weekly |
| `client/src/pages/Home.tsx` | 1, 3 | Cache, health ping, merge results |
| `client/src/components/OpportunityList.tsx` | 1 | Loading skeleton |
| `client/src/components/OpportunityCard.tsx` | 1, 3, 5 | Deadline badges, live badge, industry tags |
| `client/src/components/FilterPanel.tsx` | 2 | Use dropdown components |
| `client/src/components/MultiSelectDropdown.tsx` | 2 | **New file** |
| `server/src/services/liveSearchService.ts` | 3, 5 | Enrich results, tag extraction, dynamic years |
| `shared/types.ts` | 3 | Add isLiveResult fields |
| `client/src/types/index.ts` | 3 | Add isLiveResult fields |
| `server/src/controllers/opportunitiesController.ts` | 3 | Save-live endpoint |
| `server/src/routes/opportunities.ts` | 3 | Save-live route |
| `server/src/scrapers/linkupcfp.ts` | 4, 5 | More industries, dynamic years |
| `server/src/scrapers/callingallpapers.ts` | 4 | **New file** |
| `server/src/scrapers/sessionize.ts` | 4 | **New file** |
| `server/src/scrapers/papercall.ts` | 4 | **New file** |
| `server/src/scrapers/wikicfp.ts` | 4 | **New file** |
| `server/src/index.ts` | 4 | Weekly sync scheduling |
| `prisma/schema.prisma` | 4 | SyncStatus model |
| `prisma/schema.production.prisma` | 4 | SyncStatus model |
| `server/package.json` | 4 | Add cheerio dependency |
| `client/src/App.tsx` | 1 | Health ping on mount |

---

## Testing Strategy

- After Phase 1: Verify no past-deadline entries appear in the default view. Verify cached data appears instantly on page reload. Verify skeleton cards show during loading.
- After Phase 2: Verify location/industry dropdowns work, selections persist, and filter counts update correctly.
- After Phase 3: Verify live results appear in the same grid as stored results, with "Live" badges. Verify saving a live result persists it to the database. Verify deduplication works.
- After Phase 4: Run each new scraper independently and verify it produces valid ScraperResult records. Verify weekly sync schedule triggers correctly. Check SyncStatus records after a sync.
- After Phase 5: Visual review of industry tags, deadline badges, and null-deadline handling.

## Deployment Notes

- Phase 1 & 2 can be deployed independently (no schema changes)
- Phase 4 requires a Prisma migration for the SyncStatus model and `npm install` for cheerio
- Build command in `render.yaml` already runs `prisma db push` so schema changes auto-apply
- New scrapers that require API keys should have their keys added to Render env vars
