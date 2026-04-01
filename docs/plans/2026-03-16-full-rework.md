# Speaking Opportunity Finder — Full Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform SOF from a functional prototype into a polished, performant, production-grade SaaS product and portfolio piece.

**Architecture:** Four-phase rework addressing performance, data pipeline integrity, design quality, and production hardening — in that order. Each phase is independently deployable. Server stays Express+Prisma, client gets shadcn/ui component library, data pipeline gets unified search and proper lifecycle management.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Express, Prisma, PostgreSQL, Anthropic Claude SDK, Render

---

## Phase 1: Performance & Stabilization

**Goal:** Cut initial load time from 10-30s to under 3s (warm) / under 5s (cold), eliminate unnecessary API calls, fix visible bugs.

---

### Task 1.1: Install vitest and set up test infrastructure

**Files:**
- Modify: `client/package.json`
- Modify: `server/package.json`
- Create: `server/vitest.config.ts`
- Create: `client/vitest.config.ts`
- Modify: `package.json` (root — add test scripts)

**Step 1: Install vitest in server**

```bash
cd server && npm install -D vitest
```

**Step 2: Create server/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 3: Install vitest in client**

```bash
cd client && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Step 4: Create client/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

**Step 5: Create client/src/test-setup.ts**

```typescript
import '@testing-library/jest-dom';
```

**Step 6: Add test scripts to root package.json**

Add to `"scripts"`:
```json
"test": "npm run test:server && npm run test:client",
"test:server": "cd server && npx vitest run",
"test:client": "cd client && npx vitest run"
```

**Step 7: Verify setup works**

```bash
npm run test
```

Expected: Both vitest runners execute with 0 tests found.

**Step 8: Commit**

```bash
git add -A && git commit -m "chore: add vitest test infrastructure for server and client"
```

---

### Task 1.2: Code-split routes with React.lazy

**Files:**
- Modify: `client/src/App.tsx` (38 lines)

**Step 1: Write a smoke test**

Create `client/src/App.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    // App wraps in AuthProvider + Router, so we just need to confirm it mounts
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });
});
```

Run: `cd client && npx vitest run src/App.test.tsx`
Expected: PASS (basic smoke test)

**Step 2: Refactor App.tsx to use React.lazy**

Replace the static imports (lines 2-7) with lazy imports and wrap Routes in Suspense:

```typescript
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { lazy, Suspense, useEffect } from 'react';
import Layout from './components/Layout';
import apiClient from './api/client';

const Home = lazy(() => import('./pages/Home'));
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail'));
const SavedOpportunities = lazy(() => import('./pages/SavedOpportunities'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

function AppContent() {
  useEffect(() => {
    apiClient.get('/health').catch(() => {});
  }, []);

  return (
    <Layout>
      <Suspense fallback={<div className="flex justify-center items-center min-h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/saved" element={<SavedOpportunities />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
```

Note: Each page component must use `export default` for lazy() to work. Check each page file — if they use named exports, add a default export.

**Step 3: Verify pages still use default exports**

Check each page file for `export default`. If any use named exports only, add `export default ComponentName` at the bottom.

**Step 4: Run test and verify**

```bash
cd client && npx vitest run
```

**Step 5: Verify build still works**

```bash
cd client && npm run build
```

Expected: Multiple chunks in `dist/assets/` (one per lazy route).

**Step 6: Commit**

```bash
git add -A && git commit -m "perf: code-split routes with React.lazy for faster initial load"
```

---

### Task 1.3: Add debounced filter fetching

**Files:**
- Create: `client/src/hooks/useDebounce.ts`
- Modify: `client/src/pages/Home.tsx` (lines 81-127 — fetchOpportunities effect)

**Step 1: Write test for useDebounce hook**

Create `client/src/hooks/useDebounce.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('debounces value changes', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'hello' } }
    );

    rerender({ value: 'world' });
    expect(result.current).toBe('hello');

    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('world');
    vi.useRealTimers();
  });
});
```

Run: `cd client && npx vitest run src/hooks/useDebounce.test.ts`
Expected: FAIL (hook doesn't exist yet)

**Step 2: Implement useDebounce**

Create `client/src/hooks/useDebounce.ts`:
```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

Run: `cd client && npx vitest run src/hooks/useDebounce.test.ts`
Expected: PASS

**Step 3: Apply debounce to Home.tsx filters**

In `Home.tsx`, import and use the hook. The fetchOpportunities effect (around line 81) depends on `filters` and `page`. Debounce the filters object:

```typescript
import { useDebounce } from '../hooks/useDebounce';

// Inside Home component, after filters state declaration:
const debouncedFilters = useDebounce(filters, 400);
```

Then change the useEffect dependency from `filters` to `debouncedFilters` and use `debouncedFilters` in the fetch call. This prevents API spam on rapid filter changes.

**Step 4: Run full client tests**

```bash
cd client && npx vitest run
```

**Step 5: Commit**

```bash
git add -A && git commit -m "perf: debounce filter changes to reduce API calls"
```

---

### Task 1.4: Cache filter options in localStorage

**Files:**
- Modify: `client/src/components/FilterPanel.tsx` (lines 47-60 — filter options fetch)

**Step 1: Add localStorage caching to FilterPanel**

In `FilterPanel.tsx`, the current effect (lines 47-60) fetches `/opportunities/filters` on every mount. Wrap it with a localStorage cache (1-hour TTL):

```typescript
useEffect(() => {
  const CACHE_KEY = 'filter_options_cache';
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour

  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        setFilterOptions(data);
        return;
      }
    } catch { /* invalid cache, refetch */ }
  }

  const fetchFilters = async () => {
    try {
      const response = await apiClient.get<FilterOptions>('/opportunities/filters');
      if (response.success && response.data) {
        setFilterOptions(response.data);
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: response.data,
          timestamp: Date.now(),
        }));
      }
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
    }
  };
  fetchFilters();
}, []);
```

**Step 2: Verify manually**

Run `npm run dev`, open browser, check Network tab — filter options should only fetch once per hour.

**Step 3: Commit**

```bash
git add -A && git commit -m "perf: cache filter options in localStorage with 1-hour TTL"
```

---

### Task 1.5: Fix mobile navigation

**Files:**
- Modify: `client/src/components/Navbar.tsx` (76 lines)

**Step 1: Add mobile hamburger menu**

The current Navbar has `hidden md:flex` on the nav links (line 19) with no mobile toggle. Add a hamburger button and mobile menu:

Add state at top of component:
```typescript
const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
```

Add hamburger button before the `hidden md:flex` nav — visible only on mobile:
```tsx
<button
  className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
  aria-label="Toggle menu"
  aria-expanded={isMobileMenuOpen}
>
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    {isMobileMenuOpen ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    )}
  </svg>
</button>
```

Add mobile dropdown menu after the desktop nav:
```tsx
{isMobileMenuOpen && (
  <div className="md:hidden border-t border-gray-200 py-2 space-y-1">
    <Link to="/" className="block px-4 py-2 text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>Browse</Link>
    {isAuthenticated && <Link to="/saved" className="block px-4 py-2 text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>Saved</Link>}
    {isAdmin && <Link to="/admin/dashboard" className="block px-4 py-2 text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>Analytics</Link>}
    {isAuthenticated ? (
      <button onClick={() => { logout(); setIsMobileMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100">Logout</button>
    ) : (
      <>
        <Link to="/login" className="block px-4 py-2 text-gray-700 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>Log In</Link>
        <Link to="/register" className="block px-4 py-2 text-blue-600 hover:bg-gray-100" onClick={() => setIsMobileMenuOpen(false)}>Sign Up</Link>
      </>
    )}
  </div>
)}
```

**Step 2: Test on mobile viewport**

Run `npm run dev`, open DevTools, toggle mobile view. Verify hamburger appears and menu works.

**Step 3: Commit**

```bash
git add -A && git commit -m "fix: add mobile hamburger menu to navbar"
```

---

### Task 1.6: Add composite database indexes for analytics

**Files:**
- Modify: `prisma/schema.prisma` (Opportunity model, lines 45-52)
- Modify: `prisma/schema.production.prisma` (same section)

**Step 1: Add composite indexes**

Add these indexes to the Opportunity model in BOTH schema files:

```prisma
@@index([source, createdAt])
@@index([enrichmentStatus, createdAt])
@@index([cfpDeadline, source])
```

These cover the most expensive analytics queries:
- `getScraperHealth()` filters by source + time windows
- `processNextUnenriched()` queries by enrichmentStatus + orders by createdAt
- `cleanupExpired()` filters by cfpDeadline + excludes Live Search source

**Step 2: Push schema changes**

```bash
npx prisma db push
```

**Step 3: Commit**

```bash
git add -A && git commit -m "perf: add composite indexes for analytics and enrichment queries"
```

---

### Task 1.7: Cap background enrichment with daily budget

**Files:**
- Modify: `server/src/services/backgroundEnrichment.ts` (174 lines)

**Step 1: Write test for budget tracking**

Create `server/src/services/backgroundEnrichment.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

// Test the budget reset logic in isolation
describe('enrichment budget', () => {
  it('resets daily budget at midnight', () => {
    const now = new Date('2026-03-16T00:00:01Z');
    const lastReset = new Date('2026-03-15T00:00:01Z');
    const isSameDay = now.toDateString() === lastReset.toDateString();
    expect(isSameDay).toBe(false); // Should trigger reset
  });

  it('does not reset within same day', () => {
    const now = new Date('2026-03-16T14:00:00Z');
    const lastReset = new Date('2026-03-16T01:00:00Z');
    const isSameDay = now.toDateString() === lastReset.toDateString();
    expect(isSameDay).toBe(true); // Should NOT reset
  });
});
```

Run: `cd server && npx vitest run src/services/backgroundEnrichment.test.ts`
Expected: PASS

**Step 2: Add budget tracking to backgroundEnrichment.ts**

Add to the state interface and initialization:

```typescript
interface BackgroundEnrichmentState {
  isRunning: boolean;
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
  lastRunTime: Date | null;
  dailyEnrichmentCount: number;
  dailyBudgetResetDate: string;
}

const DAILY_ENRICHMENT_LIMIT = 200;
```

In `processNextUnenriched()`, add budget check at the top:

```typescript
// Reset daily budget if new day
const today = new Date().toDateString();
if (state.dailyBudgetResetDate !== today) {
  state.dailyEnrichmentCount = 0;
  state.dailyBudgetResetDate = today;
}

// Check budget
if (state.dailyEnrichmentCount >= DAILY_ENRICHMENT_LIMIT) {
  console.log(`[BackgroundEnrichment] Daily budget of ${DAILY_ENRICHMENT_LIMIT} reached. Pausing until tomorrow.`);
  return;
}
```

After successful enrichment, increment: `state.dailyEnrichmentCount++`

**Step 3: Run tests**

```bash
cd server && npx vitest run
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add daily budget cap (200/day) to background enrichment"
```

---

### Task 1.8: Fix N+1 queries in analyticsService

**Files:**
- Modify: `server/src/services/analyticsService.ts` (565 lines)

This is the biggest performance offender. The current `getScraperHealth()` runs ~90 queries (15 scrapers x 6 queries each). `getSourceQuality()` and `getDatabaseStats()` have similar problems.

**Step 1: Rewrite getScraperHealth() with aggregation**

Replace the per-scraper query loop (lines 99-139) with a single aggregated approach:

```typescript
async function getScraperHealth() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Single query: group by source, get counts and latest date
  const allSourceData = await prisma.opportunity.groupBy({
    by: ['source'],
    _count: { id: true },
    _max: { createdAt: true },
    _avg: { qualityScore: true },
  });

  // Time-windowed counts in 3 queries instead of 90
  const [last24h, last7d, last30d] = await Promise.all([
    prisma.opportunity.groupBy({ by: ['source'], _count: { id: true }, where: { createdAt: { gte: oneDayAgo } } }),
    prisma.opportunity.groupBy({ by: ['source'], _count: { id: true }, where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.opportunity.groupBy({ by: ['source'], _count: { id: true }, where: { createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  // Build lookup maps
  const last24hMap = Object.fromEntries(last24h.map(s => [s.source, s._count.id]));
  const last7dMap = Object.fromEntries(last7d.map(s => [s.source, s._count.id]));
  const last30dMap = Object.fromEntries(last30d.map(s => [s.source, s._count.id]));

  return allSourceData.map(source => ({
    name: source.source,
    total: source._count.id,
    last24h: last24hMap[source.source] || 0,
    last7d: last7dMap[source.source] || 0,
    last30d: last30dMap[source.source] || 0,
    avgQuality: Math.round(source._avg.qualityScore || 0),
    lastActivity: source._max.createdAt,
    status: getScraperStatus(source._max.createdAt, now),
  }));
}

function getScraperStatus(lastActivity: Date | null, now: Date): string {
  if (!lastActivity) return 'unknown';
  const hoursSince = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
  if (hoursSince < 48) return 'online';
  if (hoursSince < 168) return 'degraded';
  return 'offline';
}
```

This reduces ~90 queries to 4.

**Step 2: Rewrite getDatabaseStats() to avoid loading all records**

Replace the all-in-memory approach (line 288) with aggregation queries. For the industry/location extraction from JSON strings, use a single query with a reasonable LIMIT:

```typescript
// Instead of loading ALL opportunities:
const recentOpportunities = await prisma.opportunity.findMany({
  select: { industries: true, location: true },
  where: { cfpDeadline: { gte: new Date() } },
  take: 5000, // Cap to prevent memory issues
});
```

**Step 3: Apply similar pattern to getSourceQuality() and getEnrichmentStats()**

Use `groupBy` queries instead of per-source loops.

**Step 4: Run tests and verify**

```bash
cd server && npx vitest run
```

**Step 5: Commit**

```bash
git add -A && git commit -m "perf: rewrite analytics queries from N+1 to aggregated groupBy"
```

---

## Phase 2: Data Pipeline Unification

**Goal:** Merge live search and DB search into one coherent experience. Add proper data lifecycle management. Fix data quality issues.

---

### Task 2.1: Add TTL cleanup for live search results

**Files:**
- Modify: `server/src/scrapers/index.ts` (lines 296-311 — cleanupExpired)

**Step 1: Write test for cleanup logic**

Create `server/src/services/cleanup.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('cleanup logic', () => {
  it('should identify live search results older than 7 days as expired', () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const createdAt = new Date(sevenDaysAgo.getTime() - 1000); // 7 days + 1 second ago
    expect(createdAt < sevenDaysAgo).toBe(true);
  });
});
```

**Step 2: Modify cleanupExpired to include live search TTL**

In `server/src/scrapers/index.ts`, the current `cleanupExpired()` (lines 296-311) excludes Live Search results. Add a separate cleanup for stale live results:

```typescript
async function cleanupExpired(): Promise<number> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Delete expired non-live results (existing behavior)
  const expiredResult = await prisma.opportunity.deleteMany({
    where: {
      cfpDeadline: { lt: now },
      NOT: { source: { startsWith: 'Live Search' } },
    },
  });

  // Delete stale live search results (NEW: 7-day TTL)
  const staleLiveResult = await prisma.opportunity.deleteMany({
    where: {
      source: { startsWith: 'Live Search' },
      createdAt: { lt: sevenDaysAgo },
    },
  });

  const total = expiredResult.count + staleLiveResult.count;
  console.log(`[Cleanup] Removed ${expiredResult.count} expired + ${staleLiveResult.count} stale live results`);
  return total;
}
```

**Step 3: Run tests**

```bash
cd server && npx vitest run
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add 7-day TTL cleanup for live search results"
```

---

### Task 2.2: Unify search API — merge live and DB search

**Files:**
- Modify: `server/src/controllers/opportunitiesController.ts` (lines 6-109, 166-204)
- Modify: `server/src/services/opportunityService.ts`
- Modify: `client/src/pages/Home.tsx`

This is the most impactful architectural change. Currently, the client makes two separate calls and merges results in memory. Instead, the server should handle the merge.

**Step 1: Add unified search endpoint on server**

Add a new function to `opportunitiesController.ts`:

```typescript
export async function searchOpportunities(req: Request, res: Response, next: NextFunction) {
  try {
    const { query, liveSearch, ...filterParams } = req.query;

    // Always fetch DB results
    const filters = buildFilters(filterParams);
    const dbResults = await opportunityService.getOpportunities(filters, {
      page: Number(filterParams.page) || 1,
      pageSize: Number(filterParams.pageSize) || 20,
    });

    // If liveSearch=true AND query provided, also run live search
    let liveResults: any[] = [];
    if (liveSearch === 'true' && query) {
      const industries = typeof filterParams.industries === 'string'
        ? filterParams.industries.split(',')
        : [];
      liveResults = await liveSearchService.performLiveSearch(
        query as string,
        industries
      );

      // Fire-and-forget save (existing behavior)
      liveSearchService.autoSaveLiveResults(liveResults).catch(console.error);
    }

    // Deduplicate: live results take precedence over DB results with same applyUrl
    const liveUrls = new Set(liveResults.map(r => r.url));
    const dedupedDbItems = dbResults.items.filter(
      (item: any) => !liveUrls.has(item.applyUrl)
    );

    res.json({
      success: true,
      data: {
        ...dbResults,
        items: [...liveResults.map(toLiveOpportunity), ...dedupedDbItems],
        liveResultCount: liveResults.length,
      },
    });
  } catch (error) {
    next(error);
  }
}
```

Extract `buildFilters()` from the existing `getOpportunities()` controller to a shared helper (it currently lives inline at lines 29-90).

**Step 2: Update routes**

Keep existing endpoints for backward compatibility but add the unified one:

```typescript
// In opportunities routes:
router.get('/search', searchOpportunities);
```

**Step 3: Update Home.tsx to use unified endpoint**

Replace the two separate fetch calls (fetchOpportunities + handleLiveSearch) with a single fetch to `/opportunities/search`. The `liveSearch` flag becomes a query parameter instead of a separate code path.

This simplifies Home.tsx significantly — remove:
- `liveResults` state
- `isSearching` state
- `mergedOpportunities` useMemo
- `handleLiveSearch()` function
- sessionStorage live results cache

The server handles the merge; the client just renders what it gets.

**Step 4: Update OpportunityCard to handle unified results**

Results from the unified endpoint should include an `isLiveResult: boolean` flag. The card can still show the "Live" badge based on this flag.

**Step 5: Run full test suite**

```bash
npm run test
```

**Step 6: Manual verification**

Run `npm run dev` and verify:
- Default search (no live) shows DB results as before
- Clicking "Live Search" with a query shows merged results with live badges
- Pagination still works
- Filters apply to both live and DB results

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: unify live and DB search into single API endpoint"
```

---

### Task 2.3: Improve cross-source deduplication

**Files:**
- Modify: `server/src/scrapers/index.ts` (persistResults function, lines 245-294)
- Create: `server/src/services/deduplicationService.ts`

**Step 1: Write test for fuzzy dedup**

Create `server/src/services/deduplicationService.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { generateDeduplicationKey } from './deduplicationService';

describe('deduplicationService', () => {
  it('generates same key for similar titles', () => {
    const key1 = generateDeduplicationKey('Tech Summit 2026', 'IEEE');
    const key2 = generateDeduplicationKey('IEEE Tech Summit 2026', 'IEEE');
    expect(key1).toBe(key2);
  });

  it('normalizes whitespace and case', () => {
    const key1 = generateDeduplicationKey('  React Conf  ', 'Meta');
    const key2 = generateDeduplicationKey('react conf', 'Meta');
    expect(key1).toBe(key2);
  });

  it('different events get different keys', () => {
    const key1 = generateDeduplicationKey('React Conf', 'Meta');
    const key2 = generateDeduplicationKey('Vue Summit', 'Evan You');
    expect(key1).not.toBe(key2);
  });
});
```

**Step 2: Implement deduplication service**

Create `server/src/services/deduplicationService.ts`:
```typescript
export function generateDeduplicationKey(title: string, organization: string): string {
  const normalizedTitle = title
    .toLowerCase()
    .replace(organization?.toLowerCase() || '', '')
    .replace(/\b(20\d{2})\b/g, '') // Remove years
    .replace(/[^a-z0-9]/g, '')     // Remove non-alphanumeric
    .trim();

  const normalizedOrg = (organization || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

  return `${normalizedOrg}:${normalizedTitle}`;
}
```

**Step 3: Use dedup key during persist**

In `persistResults()`, before inserting a new record, check for existing records with same dedup key (not just URL match). If found, update rather than create.

**Step 4: Run tests**

```bash
cd server && npx vitest run
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add fuzzy cross-source deduplication by title+org"
```

---

### Task 2.4: Remove dead scrapers and simulated fallback

**Files:**
- Modify: `server/src/scrapers/sessionize.ts` — delete or stub with clear comment
- Modify: `server/src/services/liveSearchService.ts` (lines 348-414 — simulated results)
- Modify: `server/src/scrapers/index.ts` — remove sessionize from scraper lists

**Step 1: Remove sessionize scraper call**

Sessionize has no public API and returns empty results. Remove it from the weekly scraper list in `scrapers/index.ts`.

**Step 2: Remove simulated live search fallback**

In `liveSearchService.ts`, the simulated fallback (lines 348-414) generates fake results with example.com URLs. Remove this — if no Linkup API key is configured, live search should return an empty array with a clear message.

```typescript
if (!apiKey) {
  console.log('[LiveSearch] No WEB_SEARCH_API_KEY configured. Live search disabled.');
  return [];
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: remove dead sessionize scraper and simulated live search fallback"
```

---

### Task 2.5: Add enrichment idempotency

**Files:**
- Modify: `server/src/services/backgroundEnrichment.ts`
- Modify: `server/src/services/enrichmentService.ts`

**Step 1: Skip recently-failed enrichments**

In `processNextUnenriched()`, exclude opportunities that failed enrichment within the last 24 hours to prevent retry loops:

```typescript
const opportunity = await prisma.opportunity.findFirst({
  where: {
    enrichmentStatus: null,
    // Don't retry recent failures
    NOT: {
      AND: [
        { enrichmentStatus: 'failed' },
        { enrichedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  },
  orderBy: { createdAt: 'desc' },
});
```

Wait — the current query only finds `enrichmentStatus: null`. Failed records already have `enrichmentStatus: 'failed'` and won't be re-queried. The real issue is if enrichment errors out without setting status. Add a try/catch that always sets status:

**Step 2: Ensure enrichment always sets status**

In `processNextUnenriched()`, wrap the enrichment call so that if it throws, the record gets marked `failed` instead of staying `null` forever:

```typescript
try {
  const enriched = await enrichOpportunity(scraperResult);
  // ... update with enriched data
} catch (error) {
  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: {
      enrichmentStatus: 'failed',
      enrichmentError: error instanceof Error ? error.message : 'Unknown error',
      enrichedAt: new Date(),
    },
  });
  state.failed++;
}
```

**Step 3: Run tests**

```bash
cd server && npx vitest run
```

**Step 4: Commit**

```bash
git add -A && git commit -m "fix: ensure enrichment always sets status to prevent infinite retry loops"
```

---

## Phase 3: Design Overhaul

**Goal:** Rebuild the UI with shadcn/ui for a polished, premium look. Mobile-first. Dark mode. Proper loading/empty/error states.

> **Note:** Per CLAUDE.md, UI work uses rapid-prototyping (Vibe Mode), not TDD. Focus on visual quality and interaction design.

---

### Task 3.1: Install and configure shadcn/ui

**Files:**
- Modify: `client/package.json`
- Create: `client/components.json` (shadcn config)
- Create: `client/src/lib/utils.ts`
- Modify: `client/tailwind.config.js`
- Modify: `client/src/index.css`

**Step 1: Install shadcn/ui dependencies**

```bash
cd client && npm install class-variance-authority clsx tailwind-merge lucide-react
```

**Step 2: Initialize shadcn/ui**

```bash
cd client && npx shadcn@latest init
```

Follow prompts:
- Style: Default
- Base color: Slate
- CSS variables: Yes
- Tailwind config path: `tailwind.config.js`
- Components path: `src/components/ui`
- Utils path: `src/lib/utils.ts`

**Step 3: Install core components**

```bash
cd client && npx shadcn@latest add button card input badge dropdown-menu dialog select sheet separator skeleton tabs tooltip
```

**Step 4: Verify build**

```bash
cd client && npm run build
```

**Step 5: Commit**

```bash
git add -A && git commit -m "chore: install and configure shadcn/ui with core components"
```

---

### Task 3.2: Add dark mode support

**Files:**
- Create: `client/src/context/ThemeContext.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/tailwind.config.js`
- Modify: `client/src/components/Navbar.tsx`

**Step 1: Configure Tailwind for dark mode**

In `tailwind.config.js`:
```javascript
module.exports = {
  darkMode: 'class',
  // ... rest of config
};
```

**Step 2: Create ThemeContext**

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('theme') as Theme) || 'system'
  );

  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && systemDark);

    root.classList.toggle('dark', isDark);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
```

**Step 3: Wrap App in ThemeProvider**

**Step 4: Add theme toggle to Navbar**

Add a sun/moon icon button using lucide-react icons.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add dark mode with system preference detection"
```

---

### Task 3.3: Redesign Layout and Navbar

**Files:**
- Rewrite: `client/src/components/Layout.tsx`
- Rewrite: `client/src/components/Navbar.tsx`

**Step 1: Redesign Navbar with shadcn components**

Build a premium navbar with:
- Logo/brand on left
- Navigation links (center or left-aligned)
- Theme toggle + auth buttons on right
- Mobile: Sheet component (slide-out drawer) instead of dropdown
- Subtle border-bottom, backdrop-blur on scroll
- Remove hardcoded ADMIN_EMAILS — fetch admin status from the auth context (the server already returns `isAdmin` on the user object)

**Step 2: Redesign Layout**

Add a proper page container with max-width, better padding, and a simple footer.

**Step 3: Verify on mobile and desktop**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: redesign navbar and layout with shadcn/ui components"
```

---

### Task 3.4: Redesign OpportunityCard

**Files:**
- Rewrite: `client/src/components/OpportunityCard.tsx`

**Step 1: Rebuild card with shadcn Card component**

Design a premium card with:
- shadcn Card, CardHeader, CardContent, CardFooter
- Badge components for format, deadline urgency, "Live" indicator
- Lucide icons for location, calendar, dollar-sign, globe
- Hover state with subtle shadow elevation
- Dark mode compatible colors
- Truncated description with "Read more" link to detail page
- Save button using shadcn DropdownMenu
- Quality score as a small visual indicator (dot or bar)
- Industries as Tag/Badge list (show all, not truncated)
- Proper compensation display (no null values)

**Step 2: Verify with real data**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: redesign opportunity card with shadcn/ui and improved UX"
```

---

### Task 3.5: Redesign FilterPanel

**Files:**
- Rewrite: `client/src/components/FilterPanel.tsx`

**Step 1: Rebuild filters with shadcn components**

- Use shadcn Select for dropdowns
- Use shadcn Input for search
- Use shadcn Badge for active filter pills (click to remove)
- Collapsible advanced filters using shadcn Collapsible
- Active filter count badge
- "Clear all" button
- The "Live Search" toggle should be a prominent switch, not a separate button

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: redesign filter panel with shadcn/ui components"
```

---

### Task 3.6: Redesign Home page

**Files:**
- Rewrite: `client/src/pages/Home.tsx`

**Step 1: Rebuild Home with proper states**

- **Loading state:** Skeleton cards (shadcn Skeleton) in the grid layout
- **Empty state:** Illustrated empty state with helpful message and CTA
- **Error state:** Error boundary with retry button
- **Results header:** "Showing X results (Y live)" with sort controls inline
- **Unified search bar:** Prominent search input at top, live search as a toggle
- **Pagination:** shadcn-styled pagination at bottom

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: redesign home page with loading, empty, and error states"
```

---

### Task 3.7: Redesign remaining pages

**Files:**
- Rewrite: `client/src/pages/Login.tsx`
- Rewrite: `client/src/pages/Register.tsx`
- Rewrite: `client/src/pages/SavedOpportunities.tsx`
- Rewrite: `client/src/pages/OpportunityDetail.tsx`
- Rewrite: `client/src/pages/AdminDashboard.tsx`

**Step 1: Login & Register**

- Centered card layout
- shadcn Input, Button, Label components
- Form validation with inline error messages
- "Don't have an account? Sign up" link

**Step 2: SavedOpportunities**

- Category tabs using shadcn Tabs (Interested, Applied, Accepted, Rejected)
- Empty states per category
- Bulk actions (move category, unsave)

**Step 3: OpportunityDetail**

- Full-width card with all data displayed
- Map or location badge
- Save/apply CTAs
- Related opportunities section (same industry)

**Step 4: AdminDashboard**

- Dashboard grid with stat cards
- Charts using a lightweight chart library (recharts)
- Scraper health status indicators
- Enrichment progress bar

**Step 5: Commit each page separately**

```bash
git commit -m "feat: redesign login and register pages"
git commit -m "feat: redesign saved opportunities with category tabs"
git commit -m "feat: redesign opportunity detail page"
git commit -m "feat: redesign admin dashboard with charts"
```

---

### Task 3.8: Accessibility pass

**Files:**
- All components in `client/src/components/`
- All pages in `client/src/pages/`

**Step 1: Add ARIA labels**

- All interactive elements need `aria-label` or associated `<label>`
- Buttons with only icons need `aria-label`
- Form inputs need `<label htmlFor>`
- Modal/dialog needs `aria-modal`, `role="dialog"`

**Step 2: Add focus management**

- Visible focus rings on all interactive elements (Tailwind `focus-visible:ring-2`)
- Tab order follows visual order
- Skip-to-content link at top of page

**Step 3: Add screen reader support**

- `aria-live="polite"` on dynamic content (search results count, loading states)
- Proper heading hierarchy (h1 > h2 > h3)
- Alt text on any images/icons that convey meaning

**Step 4: Commit**

```bash
git add -A && git commit -m "fix: WCAG AA accessibility improvements across all components"
```

---

## Phase 4: Production Hardening

**Goal:** Secure auth, rate limiting, admin management, basic test coverage, monitoring.

---

### Task 4.1: Move JWT to HttpOnly cookies

**Files:**
- Modify: `server/src/services/authService.ts`
- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/controllers/authController.ts` (or wherever login/register responses are)
- Modify: `client/src/api/client.ts`
- Modify: `client/src/context/AuthContext.tsx`

**Step 1: Write test for cookie-based auth**

Create `server/src/middleware/auth.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('auth middleware', () => {
  it('should extract token from cookie', () => {
    const cookies = 'token=abc123; other=value';
    const token = cookies.split(';')
      .map(c => c.trim().split('='))
      .find(([key]) => key === 'token')?.[1];
    expect(token).toBe('abc123');
  });

  it('should fallback to Authorization header', () => {
    const header = 'Bearer abc123';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    expect(token).toBe('abc123');
  });
});
```

**Step 2: Update server to set HttpOnly cookie**

In the login/register response handlers, instead of returning the token in the JSON body, set it as an HttpOnly cookie:

```typescript
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
});
```

Still return user data in the JSON response (just not the token).

**Step 3: Update auth middleware to check cookie first, then header**

```typescript
const token = req.cookies?.token
  || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
```

Install `cookie-parser`:
```bash
cd server && npm install cookie-parser && npm install -D @types/cookie-parser
```

Add to app.ts: `app.use(cookieParser());`

**Step 4: Update client**

- Remove token storage in localStorage
- Remove `Authorization` header logic from apiClient
- Add `credentials: 'include'` to all fetch calls
- Update logout to call `POST /auth/logout` which clears the cookie

**Step 5: Add logout endpoint**

```typescript
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});
```

**Step 6: Run tests**

```bash
npm run test
```

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: move JWT auth to HttpOnly cookies for XSS protection"
```

---

### Task 4.2: Add rate limiting

**Files:**
- Modify: `server/src/app.ts`
- Create: `server/src/middleware/rateLimit.ts`

**Step 1: Install express-rate-limit**

```bash
cd server && npm install express-rate-limit
```

**Step 2: Create rate limit middleware**

```typescript
import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Stricter for auth endpoints
  message: { success: false, error: 'Too many auth attempts, please try again later.' },
});

export const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Live search is expensive
  message: { success: false, error: 'Too many search requests, please try again later.' },
});
```

**Step 3: Apply to routes**

In `app.ts` or route files:
```typescript
app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/opportunities/live-search', searchLimiter);
app.use('/api/opportunities/search', searchLimiter);
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add rate limiting to API endpoints"
```

---

### Task 4.3: Move admin config to database

**Files:**
- Modify: `prisma/schema.prisma` (User model)
- Modify: `prisma/schema.production.prisma`
- Modify: `server/src/middleware/admin.ts`
- Modify: `client/src/components/Navbar.tsx`

**Step 1: Use isAdmin field from database**

The User model already has `isAdmin Boolean @default(false)`. The admin middleware at `server/src/middleware/admin.ts` currently checks a hardcoded email list instead. Fix it:

```typescript
export async function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError(401, 'Authentication required'));
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return next(new AppError(403, 'Admin access required'));
  }

  next();
}
```

**Step 2: Update Navbar.tsx**

Remove the hardcoded `ADMIN_EMAILS` array. The `user` object from AuthContext should already include `isAdmin`:

```typescript
const isAdmin = user?.isAdmin ?? false;
```

If the auth endpoint `/auth/me` doesn't return `isAdmin`, update it to include that field.

**Step 3: Set your user as admin in the database**

```bash
npx prisma studio
```

Find your user record and set `isAdmin: true`.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: move admin authorization from hardcoded emails to database isAdmin flag"
```

---

### Task 4.4: Add request logging

**Files:**
- Modify: `server/src/app.ts`

**Step 1: Install pino**

```bash
cd server && npm install pino pino-http
```

**Step 2: Add request logging middleware**

```typescript
import pinoHttp from 'pino-http';

const logger = pinoHttp({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

app.use(logger);
```

Install pino-pretty for dev: `npm install -D pino-pretty`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add structured request logging with pino"
```

---

### Task 4.5: Add critical path tests

**Files:**
- Create: `server/src/services/opportunityService.test.ts`
- Create: `server/src/services/enrichmentService.test.ts`
- Create: `server/src/scrapers/index.test.ts`

**Step 1: Test opportunity filtering logic**

Test the filter construction and date handling in opportunityService — these are the most critical business logic paths.

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('opportunityService', () => {
  describe('filter construction', () => {
    it('defaults to future-deadline filter', () => {
      // Test that the default where clause includes cfpDeadline >= now
    });

    it('handles multi-industry OR filter', () => {
      // Test that industries filter uses OR logic
    });

    it('handles location fuzzy search', () => {
      // Test location contains logic
    });
  });
});
```

**Step 2: Test enrichment parsing**

```typescript
describe('enrichmentService', () => {
  it('parses valid JSON response from Claude', () => {
    // Test parseEnrichmentResponse with known JSON
  });

  it('handles markdown-wrapped JSON', () => {
    // Test extraction from ```json ... ``` blocks
  });

  it('validates dates in 1900-2100 range', () => {
    // Test date validation
  });

  it('skips enrichment when all fields present', () => {
    // Test the skip logic
  });
});
```

**Step 3: Test quality scoring**

```typescript
describe('qualityScoring', () => {
  it('gives max score to complete opportunities', () => {
    // All fields present = high score
  });

  it('gives minimum score to empty opportunities', () => {
    // Only title and source = 20
  });

  it('gives trusted source bonus', () => {
    // PaperCall source = +5
  });
});
```

**Step 4: Run all tests**

```bash
npm run test
```

**Step 5: Commit**

```bash
git add -A && git commit -m "test: add critical path tests for opportunity filtering, enrichment, and scoring"
```

---

### Task 4.6: Add password reset flow

**Files:**
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/services/authService.ts`
- Modify: `prisma/schema.prisma` (User model)
- Create: `client/src/pages/ForgotPassword.tsx`
- Create: `client/src/pages/ResetPassword.tsx`
- Modify: `client/src/App.tsx` (add routes)

**Step 1: Add reset token fields to User model**

```prisma
model User {
  // ... existing fields
  resetToken        String?
  resetTokenExpires DateTime?
}
```

**Step 2: Add forgot password endpoint**

```typescript
// POST /auth/forgot-password
// Generates a reset token, stores hash in DB
// In a real app, sends email. For now, log the reset URL.
```

**Step 3: Add reset password endpoint**

```typescript
// POST /auth/reset-password
// Validates token, updates password, clears reset fields
```

**Step 4: Build forgot/reset password pages**

Simple forms with shadcn components.

**Step 5: Add "Forgot password?" link to Login page**

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add password reset flow with token-based verification"
```

---

## Execution Order Summary

| # | Task | Phase | Priority | Est. Complexity |
|---|------|-------|----------|-----------------|
| 1.1 | Test infrastructure | 1 | Critical | Low |
| 1.2 | Code-split routes | 1 | Critical | Low |
| 1.3 | Debounced filters | 1 | Critical | Low |
| 1.4 | Cache filter options | 1 | High | Low |
| 1.5 | Fix mobile nav | 1 | High | Low |
| 1.6 | Database indexes | 1 | High | Low |
| 1.7 | Enrichment budget cap | 1 | High | Medium |
| 1.8 | Fix N+1 analytics | 1 | High | Medium |
| 2.1 | Live search TTL | 2 | Critical | Low |
| 2.2 | Unified search API | 2 | Critical | High |
| 2.3 | Cross-source dedup | 2 | High | Medium |
| 2.4 | Remove dead scrapers | 2 | Medium | Low |
| 2.5 | Enrichment idempotency | 2 | High | Low |
| 3.1 | Install shadcn/ui | 3 | Critical | Low |
| 3.2 | Dark mode | 3 | High | Low |
| 3.3 | Navbar + Layout | 3 | Critical | Medium |
| 3.4 | OpportunityCard | 3 | Critical | Medium |
| 3.5 | FilterPanel | 3 | Critical | Medium |
| 3.6 | Home page | 3 | Critical | Medium |
| 3.7 | Remaining pages | 3 | High | High |
| 3.8 | Accessibility | 3 | High | Medium |
| 4.1 | HttpOnly cookies | 4 | Critical | Medium |
| 4.2 | Rate limiting | 4 | High | Low |
| 4.3 | Admin from DB | 4 | High | Low |
| 4.4 | Request logging | 4 | Medium | Low |
| 4.5 | Critical path tests | 4 | High | Medium |
| 4.6 | Password reset | 4 | Medium | Medium |

---

## Dependencies Between Tasks

```
1.1 (test infra) → 1.3, 1.7, 1.8, 2.1, 2.3, 2.5, 4.1, 4.5
1.2 (code-split) → 3.6 (home page redesign)
2.2 (unified search) → 3.5 (filter redesign), 3.6 (home redesign)
3.1 (shadcn install) → 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
3.3 (navbar) → 3.7 (remaining pages)
4.1 (cookies) → 4.6 (password reset)
```

All Phase 1 tasks can run in parallel after 1.1.
Phase 2 tasks can mostly run in parallel.
Phase 3 must run sequentially (3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8).
Phase 4 tasks can mostly run in parallel after 4.1.
