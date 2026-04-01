# Speaking Opportunity Finder — Final Product Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship this as a polished, reliable product by fixing data quality, migrating to Vercel, adding saved searches, graying out past opportunities, fixing admin access, adding E2E tests, and cleaning up UX.

**Architecture:** Vercel replaces Render — frontend as static build, Express API as a single serverless function via `@vercel/node`, Vercel Cron for scheduled syncs/enrichment, Vercel Postgres (or keep existing Render Postgres with connection string). Saved searches stored as a new `SavedSearch` model in Prisma.

**Tech Stack:** React 18 + Vite, Express (serverless-adapted), Prisma + PostgreSQL, Vercel Cron, Playwright (E2E)

---

## Phase 1: Data Quality Fixes

These are the highest-impact changes — the screenshots show HTML entities, junk entries, and missing data throughout.

### Task 1.1: Add HTML Entity Decoder Utility

**Files:**
- Modify: `server/src/services/dataNormalization.ts`
- Modify: `server/src/tests/dataNormalization.test.ts`

**Step 1: Write the failing test**

In `server/src/tests/dataNormalization.test.ts`, add:

```typescript
import { decodeHtmlEntities } from '../services/dataNormalization.js';

describe('decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('&amp; &lt; &gt; &quot; &apos;')).toBe('& < > " \'');
  });

  it('decodes numeric entities', () => {
    expect(decodeHtmlEntities('&#x27; &#39; &#8220; &#8221;')).toBe('\' \' \u201C \u201D');
  });

  it('returns plain text unchanged', () => {
    expect(decodeHtmlEntities('Hello world')).toBe('Hello world');
  });

  it('handles mixed content', () => {
    expect(decodeHtmlEntities('CALL &quot;YOUNG ENERGY&quot;')).toBe('CALL "YOUNG ENERGY"');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/tests/dataNormalization.test.ts`
Expected: FAIL — `decodeHtmlEntities` not exported

**Step 3: Implement the decoder**

In `server/src/services/dataNormalization.ts`, add:

```typescript
const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019',
  '&ldquo;': '\u201C', '&rdquo;': '\u201D',
};

export function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  let result = text;

  // Named entities
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    result = result.replaceAll(entity, char);
  }

  // Hex numeric entities: &#x27; &#xA9;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  );

  // Decimal numeric entities: &#39; &#169;
  result = result.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCodePoint(parseInt(dec, 10))
  );

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/tests/dataNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/dataNormalization.ts server/src/tests/dataNormalization.test.ts
git commit -m "feat: add HTML entity decoder utility"
```

---

### Task 1.2: Wire Entity Decoding Into All Data Paths

**Files:**
- Modify: `server/src/scrapers/index.ts` — decode in `persistResults()`
- Modify: `server/src/services/liveSearchService.ts` — decode in live result mapping

**Step 1: In `server/src/scrapers/index.ts`, find `persistResults()` and decode title, organization, description before DB insert**

Apply `decodeHtmlEntities()` to `result.title`, `result.organization`, and `result.description` at the top of the persist loop, before any other processing.

**Step 2: In `server/src/services/liveSearchService.ts`, find where `item.content` is mapped to `description` (~line 300) and decode it**

Also decode `item.name` (title) at the mapping point.

**Step 3: Run existing tests**

Run: `cd server && npx vitest run`
Expected: All pass

**Step 4: Commit**

```bash
git add server/src/scrapers/index.ts server/src/services/liveSearchService.ts
git commit -m "fix: decode HTML entities in all scraper and live search data paths"
```

---

### Task 1.3: Add Junk Result Filtering

**Files:**
- Modify: `server/src/services/dataNormalization.ts`
- Modify: `server/src/tests/dataNormalization.test.ts`
- Modify: `server/src/scrapers/index.ts`
- Modify: `server/src/services/liveSearchService.ts`

**Step 1: Write failing tests for `isJunkResult()`**

```typescript
import { isJunkResult } from '../services/dataNormalization.js';

describe('isJunkResult', () => {
  it('rejects file extension URLs', () => {
    expect(isJunkResult({ title: '2026 CFP (2).mp4', applyUrl: 'https://example.com/file.mp4' })).toBe(true);
  });

  it('rejects "click the link" descriptions', () => {
    expect(isJunkResult({ title: 'CFP', description: 'Please click the link to complete this form.' })).toBe(true);
  });

  it('rejects titles that are just years', () => {
    expect(isJunkResult({ title: '2026 Call for Speakers' })).toBe(true);
  });

  it('accepts legitimate entries', () => {
    expect(isJunkResult({ title: 'ReactConf 2026 Call for Speakers', applyUrl: 'https://reactconf.com/cfp' })).toBe(false);
  });
});
```

**Step 2: Run to verify failure**

**Step 3: Implement `isJunkResult()`**

```typescript
const JUNK_URL_EXTENSIONS = ['.mp4', '.mp3', '.pdf', '.zip', '.exe', '.doc', '.docx', '.ppt', '.pptx'];
const JUNK_DESCRIPTION_PATTERNS = [
  /please click the link/i,
  /complete this form/i,
  /we cannot provide a description/i,
  /^(TBD|N\/A|None|null|undefined)$/i,
];
const GENERIC_TITLE_PATTERN = /^\d{4}\s+call\s+for\s+(speakers?|papers?|presenters?)\s*$/i;

export function isJunkResult(result: { title: string; description?: string | null; applyUrl?: string }): boolean {
  // Check URL extension
  if (result.applyUrl) {
    const urlPath = new URL(result.applyUrl).pathname.toLowerCase();
    if (JUNK_URL_EXTENSIONS.some(ext => urlPath.endsWith(ext))) return true;
  }

  // Check description patterns
  if (result.description) {
    if (JUNK_DESCRIPTION_PATTERNS.some(p => p.test(result.description!))) return true;
  }

  // Check generic titles with no distinguishing info
  if (GENERIC_TITLE_PATTERN.test(result.title.trim())) return true;

  return false;
}
```

**Step 4: Wire into `persistResults()` and `autoSaveLiveResults()` — skip results where `isJunkResult()` returns true**

**Step 5: Run all tests, verify pass**

**Step 6: Commit**

```bash
git add server/src/services/dataNormalization.ts server/src/tests/dataNormalization.test.ts server/src/scrapers/index.ts server/src/services/liveSearchService.ts
git commit -m "feat: filter junk results (file URLs, generic titles, placeholder descriptions)"
```

---

### Task 1.4: Improve Quality Score Minimum Threshold for Display

**Files:**
- Modify: `server/src/services/opportunityService.ts`

**Step 1: Add a minimum quality score filter to `getOpportunities()`**

In the WHERE clause, add `qualityScore: { gte: 15 }` — this hides results that scored only the base 5 points with almost no useful data.

**Step 2: Run tests, verify pass**

**Step 3: Commit**

```bash
git add server/src/services/opportunityService.ts
git commit -m "feat: hide very low quality results (score < 15) from browse"
```

---

## Phase 2: Fix Admin Access

### Task 2.1: Add Admin Promotion Script

**Files:**
- Create: `server/src/scripts/promoteAdmin.ts`

**Step 1: Create the script**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function promoteAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: tsx server/src/scripts/promoteAdmin.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: { isAdmin: true },
  });

  console.log(`Promoted ${user.email} to admin`);
  await prisma.$disconnect();
}

promoteAdmin().catch(console.error);
```

**Step 2: Run locally to promote your account**

Run: `cd server && npx tsx src/scripts/promoteAdmin.ts baileymeyers1@gmail.com`

Note: For production, you'll need to run this against the prod DATABASE_URL. Add a package.json script:
```json
"promote-admin": "tsx src/scripts/promoteAdmin.ts"
```

You can run it against prod by setting `DATABASE_URL` to your Render/Vercel Postgres connection string temporarily.

**Step 3: Commit**

```bash
git add server/src/scripts/promoteAdmin.ts server/package.json
git commit -m "feat: add admin promotion script"
```

---

## Phase 3: Env Var Validation

### Task 3.1: Fail Fast on Missing Required Env Vars

**Files:**
- Modify: `server/src/config/index.ts`

**Step 1: Add validation at the bottom of config/index.ts**

```typescript
const REQUIRED_VARS: Array<{ key: string; value: unknown; prodOnly?: boolean }> = [
  { key: 'DATABASE_URL', value: config.database.url },
  { key: 'JWT_SECRET', value: config.jwt.secret, prodOnly: true },
];

export function validateConfig(): void {
  const missing = REQUIRED_VARS
    .filter(v => !v.value && (!v.prodOnly || config.nodeEnv === 'production'))
    .map(v => v.key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

**Step 2: Call `validateConfig()` at the top of `server/src/index.ts`, before `app.listen()`**

**Step 3: Test locally by unsetting DATABASE_URL, verify it crashes with clear error**

**Step 4: Commit**

```bash
git add server/src/config/index.ts server/src/index.ts
git commit -m "feat: validate required env vars at startup"
```

---

## Phase 4: Vercel Migration

This is the largest phase. The approach: keep Express as-is but wrap it for Vercel serverless, move frontend to Vercel static, use Vercel Cron for scheduled syncs.

### Task 4.1: Add Vercel Configuration

**Files:**
- Create: `vercel.json`
- Modify: `package.json` (root)

**Step 1: Create `vercel.json`**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "client/dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "crons": [
    { "path": "/api/cron/daily-sync", "schedule": "0 6 * * *" },
    { "path": "/api/cron/weekly-sync", "schedule": "0 8 * * 1" },
    { "path": "/api/cron/enrichment", "schedule": "*/5 * * * *" }
  ]
}
```

**Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel configuration with cron jobs"
```

---

### Task 4.2: Create Vercel Serverless API Entry Point

**Files:**
- Create: `api/index.ts`

The key insight: Vercel serverless functions can run Express apps. We wrap the existing Express app.

**Step 1: Create `api/index.ts`**

```typescript
import app from '../server/src/app.js';

export default app;
```

Note: This requires the server to be buildable and importable. We'll need to adjust the build to make this work.

**Step 2: Alternatively, use `@vercel/node` to export the Express app directly**

The actual approach depends on Vercel's current best practice for Express. The plan here is:
1. Build server TypeScript to `server/dist/`
2. Create `api/index.js` that imports from `server/dist/app.js`
3. Vercel's rewrite routes all `/api/*` to this function

**Step 3: Update the root `package.json` build script**

```json
"build": "cd server && npm run build && cd ../client && npm run build"
```

The server build must run first so `api/index.js` can import from `server/dist/`.

**Step 4: Update `client/vite.config.ts`** — remove the dev proxy (Vercel handles routing):

Keep the proxy for local dev but ensure `VITE_API_URL` is empty string or `/api` for Vercel (same-origin).

**Step 5: Commit**

```bash
git add api/index.ts package.json client/vite.config.ts
git commit -m "feat: add Vercel serverless API entry point"
```

---

### Task 4.3: Create Vercel Cron Endpoints

**Files:**
- Create: `server/src/routes/cron.ts`
- Modify: `server/src/app.ts`

**Step 1: Create cron route handler**

```typescript
import { Router, Request, Response } from 'express';
import { syncOpportunities } from '../scrapers/index.js';
import { processNextBatch } from '../services/backgroundEnrichment.js';

const router = Router();

// Vercel Cron sends a GET request with Authorization: Bearer <CRON_SECRET>
function verifyCronSecret(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

router.get('/daily-sync', async (req, res) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    await syncOpportunities('daily');
    res.json({ success: true, mode: 'daily' });
  } catch (error) {
    console.error('Daily cron sync failed:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

router.get('/weekly-sync', async (req, res) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    await syncOpportunities('weekly');
    res.json({ success: true, mode: 'weekly' });
  } catch (error) {
    console.error('Weekly cron sync failed:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

router.get('/enrichment', async (req, res) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    await processNextBatch(5); // Process 5 per cron invocation
    res.json({ success: true });
  } catch (error) {
    console.error('Enrichment cron failed:', error);
    res.status(500).json({ error: 'Enrichment failed' });
  }
});

export default router;
```

**Step 2: Mount in `server/src/app.ts`**

```typescript
import cronRoutes from './routes/cron.js';
// ...
app.use('/api/cron', cronRoutes);
```

**Step 3: Refactor `backgroundEnrichment.ts` — extract `processNextBatch(count)` as a standalone export**

Instead of relying on `setInterval`, expose a function that processes N items and returns. The cron job calls this every 5 minutes.

**Step 4: Update `server/src/index.ts` — remove `setInterval`-based sync scheduling**

Keep it for local dev (`ENABLE_AUTO_SYNC=true`) but the production path now relies on Vercel Cron.

**Step 5: Commit**

```bash
git add server/src/routes/cron.ts server/src/app.ts server/src/services/backgroundEnrichment.ts server/src/index.ts
git commit -m "feat: add Vercel Cron endpoints for sync and enrichment"
```

---

### Task 4.4: Update Prisma for Vercel

**Files:**
- Modify: `prisma/schema.production.prisma`
- Create: `prisma/schema.vercel.prisma` (if using Vercel Postgres)

**Step 1: Decide database**

Two options:
- **Keep Render Postgres** — just use the same `DATABASE_URL` connection string from Render in Vercel env vars. Simplest migration path.
- **Migrate to Vercel Postgres** — use `@vercel/postgres` adapter. More integrated but requires data migration.

**Recommendation:** Keep Render Postgres for now. It's free and works. Migrate later if needed.

**Step 2: Ensure Prisma generates correctly for serverless**

Add to production schema:
```prisma
generator client {
  provider = "prisma-client-js"
}
```

No other changes needed — Prisma works in serverless as long as `DATABASE_URL` is set.

**Step 3: Update build command**

The Vercel build command (in `vercel.json` or project settings):
```
cp prisma/schema.production.prisma prisma/schema.prisma && npx prisma generate && npx prisma db push && npm run build
```

**Step 4: Commit**

```bash
git add prisma/ vercel.json
git commit -m "chore: configure Prisma for Vercel serverless deployment"
```

---

### Task 4.5: Update CORS and Cookie Config for Vercel

**Files:**
- Modify: `server/src/app.ts` — CORS origin
- Modify: `server/src/controllers/authController.ts` — cookie domain

**Step 1: Since Vercel serves frontend and API from the same domain, CORS becomes same-origin**

Update CORS config to handle both Vercel (same-origin, no CORS needed) and local dev (different ports).

**Step 2: Update cookie settings — on Vercel, `sameSite: 'lax'` works since it's same-origin**

Remove the production `sameSite: 'none'` + `secure: true` workaround that was needed for cross-origin Render setup.

**Step 3: Commit**

```bash
git add server/src/app.ts server/src/controllers/authController.ts
git commit -m "fix: update CORS and cookie config for Vercel same-origin deployment"
```

---

### Task 4.6: Test Vercel Deployment Locally

**Step 1: Install Vercel CLI**

Run: `npm i -g vercel`

**Step 2: Run `vercel dev` to test locally**

Verify:
- Frontend loads at localhost:3000
- API routes work at localhost:3000/api/*
- Auth cookies work (same-origin)
- Live search works

**Step 3: Deploy to Vercel**

Run: `vercel --prod`

Set environment variables in Vercel dashboard:
- `DATABASE_URL` — Render Postgres connection string
- `JWT_SECRET` — generate a new one
- `ANTHROPIC_API_KEY`
- `WEB_SEARCH_API_KEY`
- `CRON_SECRET` — generate for cron auth
- `NODE_ENV=production`

**Step 4: Verify production deployment**

- Browse page loads
- Auth works
- Search works
- Cron endpoints respond (test manually with curl + CRON_SECRET)

**Step 5: Commit any fixes**

---

## Phase 5: Saved Searches

### Task 5.1: Add SavedSearch Model to Prisma

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/schema.production.prisma`

**Step 1: Add model**

```prisma
model SavedSearch {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  name      String
  query     String?
  filters   String   // JSON: { industries: [], locations: [], types: [], sort: '', isRemote: bool, ... }
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}
```

Also add `savedSearches SavedSearch[]` to the User model.

**Step 2: Push schema**

Run: `npx prisma db push`

**Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/schema.production.prisma
git commit -m "feat: add SavedSearch model to schema"
```

---

### Task 5.2: Add Saved Search API Routes

**Files:**
- Create: `server/src/routes/savedSearches.ts`
- Create: `server/src/controllers/savedSearchController.ts`
- Modify: `server/src/app.ts`

**Step 1: Create controller**

```typescript
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

export async function getSavedSearches(req: Request, res: Response, next: NextFunction) {
  try {
    const searches = await prisma.savedSearch.findMany({
      where: { userId: req.user!.userId },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, data: searches });
  } catch (error) { next(error); }
}

export async function createSavedSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, query, filters } = req.body;
    if (!name) throw new AppError(400, 'Name is required');

    const search = await prisma.savedSearch.create({
      data: {
        userId: req.user!.userId,
        name,
        query: query || null,
        filters: JSON.stringify(filters || {}),
      },
    });
    res.status(201).json({ success: true, data: search });
  } catch (error) { next(error); }
}

export async function updateSavedSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { name, query, filters } = req.body;

    const existing = await prisma.savedSearch.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!existing) throw new AppError(404, 'Saved search not found');

    const updated = await prisma.savedSearch.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(query !== undefined && { query }),
        ...(filters && { filters: JSON.stringify(filters) }),
      },
    });
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
}

export async function deleteSavedSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await prisma.savedSearch.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!existing) throw new AppError(404, 'Saved search not found');

    await prisma.savedSearch.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) { next(error); }
}
```

**Step 2: Create route file, mount in app.ts behind authMiddleware**

**Step 3: Commit**

```bash
git add server/src/routes/savedSearches.ts server/src/controllers/savedSearchController.ts server/src/app.ts
git commit -m "feat: add saved search CRUD API routes"
```

---

### Task 5.3: Add Saved Search UI

**Files:**
- Create: `client/src/components/SavedSearches.tsx`
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/types/index.ts`

**Step 1: Add `SavedSearch` type**

```typescript
export interface SavedSearch {
  id: string;
  name: string;
  query: string | null;
  filters: string; // JSON string
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Create `SavedSearches` component**

A dropdown/popover in the filter area that:
- Lists saved searches with name + delete button
- Click to apply: parses JSON filters, sets URL params, triggers search
- "Save current search" button that prompts for a name and POSTs current filters

Use shadcn Popover + Button + Input components.

**Step 3: Wire into Home.tsx**

Add a "Saved Searches" button next to the filter/search bar. Only visible when authenticated.

**Step 4: Test manually — save a search, reload, apply it, delete it**

**Step 5: Commit**

```bash
git add client/src/components/SavedSearches.tsx client/src/pages/Home.tsx client/src/types/index.ts
git commit -m "feat: add saved search UI with save/apply/delete"
```

---

## Phase 6: Gray Out Past Saved Opportunities

### Task 6.1: Show Past Opportunities as Grayed Out

**Files:**
- Modify: `server/src/controllers/savedController.ts` — stop filtering out past deadlines
- Modify: `client/src/pages/SavedOpportunities.tsx` — style past items
- Modify: `client/src/components/OpportunityCard.tsx` — add `isPast` prop

**Step 1: In the saved opportunities API, ensure ALL saved opportunities are returned regardless of deadline**

Check if `opportunityService` filters by deadline when fetching saved — if so, bypass that filter for saved items.

**Step 2: Add `isPast` logic to OpportunityCard**

```typescript
interface OpportunityCardProps {
  opportunity: Opportunity;
  isPast?: boolean;
  // ... existing props
}

// In the component:
const isPastDeadline = props.isPast || (opportunity.cfpDeadline && new Date(opportunity.cfpDeadline) < new Date());

// Wrap the card in:
<div className={cn(isPastDeadline && 'opacity-50 grayscale pointer-events-auto')}>
```

Show a "Deadline passed" badge on past items.

**Step 3: In SavedOpportunities.tsx, compute `isPast` for each item and pass to OpportunityCard**

Sort: active items first, then past items.

**Step 4: Commit**

```bash
git add server/src/controllers/savedController.ts client/src/pages/SavedOpportunities.tsx client/src/components/OpportunityCard.tsx
git commit -m "feat: show past saved opportunities grayed out instead of hidden"
```

---

## Phase 7: UX Polish

### Task 7.1: Add "Log In to Save" Banner

**Files:**
- Modify: `client/src/pages/Home.tsx`

**Step 1: Add a dismissible banner above the results grid for unauthenticated users**

```tsx
{!isAuthenticated && !bannerDismissed && (
  <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
    <p className="text-sm text-muted-foreground">
      <Link to="/register" className="font-medium text-primary hover:underline">Sign up</Link>
      {' '}or{' '}
      <Link to="/login" className="font-medium text-primary hover:underline">log in</Link>
      {' '}to save opportunities and searches.
    </p>
    <Button variant="ghost" size="icon" onClick={() => setBannerDismissed(true)}>
      <X className="h-4 w-4" />
    </Button>
  </div>
)}
```

Use `sessionStorage` for `bannerDismissed` so it reappears next session.

**Step 2: Commit**

```bash
git add client/src/pages/Home.tsx
git commit -m "feat: add login-to-save banner for unauthenticated users"
```

---

### Task 7.2: Add Loading Skeleton to Detail Page

**Files:**
- Modify: `client/src/pages/OpportunityDetail.tsx`

**Step 1: Check current loading state in OpportunityDetail.tsx**

The explore agent reported it already has a skeleton. Verify — if incomplete, enhance with:
- Title skeleton (h-8 w-3/4)
- Organization skeleton (h-5 w-1/2)
- Metadata grid with 4-6 skeleton blocks
- Description skeleton (3 lines)

Use the same Skeleton component from shadcn used elsewhere.

**Step 2: Commit**

```bash
git add client/src/pages/OpportunityDetail.tsx
git commit -m "fix: improve loading skeleton on opportunity detail page"
```

---

## Phase 8: E2E Tests with Playwright

### Task 8.1: Set Up Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/` directory
- Modify: `package.json` (root)

**Step 1: Install Playwright**

Run: `npm init playwright@latest` — choose TypeScript, `e2e/` directory, add GitHub Actions workflow: no.

**Step 2: Configure `playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
```

**Step 3: Add script to root package.json**

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**Step 4: Commit**

```bash
git add playwright.config.ts e2e/ package.json
git commit -m "chore: set up Playwright for E2E testing"
```

---

### Task 8.2: Write Core E2E Tests

**Files:**
- Create: `e2e/browse.spec.ts`
- Create: `e2e/auth.spec.ts`
- Create: `e2e/saved.spec.ts`

**Step 1: Browse page test**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Browse page', () => {
  test('loads and displays opportunities', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="opportunity-card"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('search filters results', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[placeholder*="Search"]', 'energy');
    await page.waitForResponse(resp => resp.url().includes('/api/opportunities'));
    await expect(page.locator('[data-testid="opportunity-card"]')).toHaveCount.greaterThan(0);
  });

  test('filter dropdowns work', async ({ page }) => {
    await page.goto('/');
    // Open industry filter, select one, verify URL updates
    await page.click('[data-testid="industry-filter"]');
    await page.click('text=Technology');
    await expect(page).toHaveURL(/industries/);
  });
});
```

**Step 2: Auth flow test**

```typescript
test.describe('Authentication', () => {
  test('register, login, logout flow', async ({ page }) => {
    const email = `test-${Date.now()}@example.com`;

    // Register
    await page.goto('/register');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Logout')).toBeVisible();

    // Logout
    await page.click('text=Logout');
    await expect(page.locator('text=Login')).toBeVisible();

    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Logout')).toBeVisible();
  });
});
```

**Step 3: Saved opportunities test**

```typescript
test.describe('Saved opportunities', () => {
  test.use({ storageState: 'e2e/.auth/user.json' }); // Reuse auth state

  test('save and view opportunity', async ({ page }) => {
    await page.goto('/');
    // Click save on first card
    const firstCard = page.locator('[data-testid="opportunity-card"]').first();
    await firstCard.locator('[data-testid="save-button"]').click();
    await firstCard.locator('text=Interested').click();

    // Navigate to saved
    await page.click('text=Saved');
    await expect(page.locator('[data-testid="opportunity-card"]')).toHaveCount(1);
  });
});
```

**Step 4: Add `data-testid` attributes to key components (OpportunityCard, filter dropdowns, save button)**

This is needed for reliable E2E selectors.

**Step 5: Run tests**

Run: `npx playwright test`

**Step 6: Commit**

```bash
git add e2e/ client/src/components/OpportunityCard.tsx client/src/pages/Home.tsx
git commit -m "test: add E2E tests for browse, auth, and saved flows"
```

---

## Phase 9: Documentation

### Task 9.1: Write README.md

**Files:**
- Create: `README.md`

**Content outline:**
- Project description (what it does, who it's for)
- Screenshot
- Tech stack
- Local development setup (prerequisites, clone, install, env vars, prisma setup, run)
- Environment variables table (required vs optional, descriptions)
- Architecture overview (monorepo structure, data flow, scraper schedule)
- Deployment (Vercel setup, env vars, cron jobs)
- Database (schema overview, backup strategy)
- Admin access (how to promote a user)
- Testing (unit tests, E2E tests)

**Step 1: Write it**

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README"
```

---

### Task 9.2: Database Backup Strategy Docs

**Files:**
- Create: `docs/database-strategy.md`

**Content:**
- Current setup: Render Postgres (free tier)
- Backup approach: `pg_dump` via cron or manual
- Add a script: `scripts/backup-db.sh` that runs `pg_dump` to a dated file
- Recovery: `psql < backup.sql`
- Vercel Postgres migration path (if switching later)
- Data retention: when old opportunities are cleaned up, how quality scores decay

**Step 1: Write it**

**Step 2: Commit**

```bash
git add docs/database-strategy.md
git commit -m "docs: add database backup strategy documentation"
```

---

## Execution Order Summary

| Phase | Tasks | Estimated Effort | Dependencies |
|-------|-------|-----------------|--------------|
| 1. Data Quality | 1.1–1.4 | Medium | None |
| 2. Admin Access | 2.1 | Small | None |
| 3. Env Validation | 3.1 | Small | None |
| 4. Vercel Migration | 4.1–4.6 | Large | Phases 1-3 done first recommended |
| 5. Saved Searches | 5.1–5.3 | Medium | Phase 4 (schema changes) |
| 6. Gray Out Past | 6.1 | Small | None |
| 7. UX Polish | 7.1–7.2 | Small | None |
| 8. E2E Tests | 8.1–8.2 | Medium | Phases 1-7 done (stable app) |
| 9. Documentation | 9.1–9.2 | Small | Phase 4 (deployment info) |

**Phases 1, 2, 3, 6, 7 can be done in parallel** — no dependencies between them.
**Phase 4 (Vercel) should come after data quality fixes** so you deploy clean.
**Phase 5 (saved searches) requires schema changes** — do after Vercel migration so you only push schema once.
**Phase 8 (E2E) should be last** — test the final state.
**Phase 9 (docs) can be done anytime** but benefits from final architecture.
