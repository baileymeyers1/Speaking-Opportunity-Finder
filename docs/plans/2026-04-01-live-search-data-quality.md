# Live Search Data Quality Overhaul

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make live search return accurate, trustworthy results where locations match the filter, dates are populated when available, and irrelevant results are excluded.

**Architecture:** Three changes to `liveSearchService.ts`: (1) Let Claude overwrite regex-extracted metadata instead of only filling gaps, (2) validate locations post-enrichment against user filters using Claude-extracted location as source of truth, (3) increase page text budget so Claude has enough content to find dates/venues. One new test file for the enrichment merge logic.

**Tech Stack:** TypeScript, Anthropic SDK (claude-haiku-4-5), Vitest

---

### Task 1: Write tests for metadata merge logic

The current merge logic (line 844-897) only fills missing fields. We need to extract this into a testable function and verify Claude data takes priority.

**Files:**
- Create: `server/src/services/liveSearchMetadataMerge.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { mergeClaudeMetadata } from './liveSearchService.js';
import type { EnrichedLiveResult } from './liveSearchService.js';

function makeResult(overrides: Partial<EnrichedLiveResult> = {}): EnrichedLiveResult {
  return {
    id: 'live-test',
    title: 'Test Conference',
    organization: 'Test Org',
    description: 'A test conference',
    location: null,
    isRemote: false,
    eventDate: null,
    cfpDeadline: null,
    format: 'conference',
    industries: [],
    compensationType: null,
    compensationAmount: null,
    compensationDetails: null,
    applyUrl: 'https://example.com',
    qualityScore: 20,
    source: 'Live Search',
    sourceUrl: 'https://example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isLiveResult: true,
    liveSearchUrl: 'https://example.com',
    ...overrides,
  };
}

describe('mergeClaudeMetadata', () => {
  it('overwrites regex location with Claude location', () => {
    const result = makeResult({ location: 'Los Angeles' });
    const claudeMeta = { location: 'Boston, MA' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.location).toBe('Boston, MA');
  });

  it('overwrites null eventDate with Claude eventDate', () => {
    const result = makeResult({ eventDate: null });
    const claudeMeta = { eventDate: '2026-09-15' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.eventDate).toBe('2026-09-15T00:00:00.000Z');
  });

  it('overwrites existing eventDate with Claude eventDate', () => {
    const result = makeResult({ eventDate: '2026-01-01T00:00:00.000Z' });
    const claudeMeta = { eventDate: '2026-09-15' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.eventDate).toBe('2026-09-15T00:00:00.000Z');
  });

  it('overwrites existing cfpDeadline with Claude cfpDeadline', () => {
    const result = makeResult({ cfpDeadline: '2026-01-01T00:00:00.000Z' });
    const claudeMeta = { cfpDeadline: '2026-06-01' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.cfpDeadline).toBe('2026-06-01T00:00:00.000Z');
  });

  it('does not clear fields when Claude returns undefined', () => {
    const result = makeResult({ location: 'Chicago, IL', eventDate: '2026-05-01T00:00:00.000Z' });
    const claudeMeta = {};
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.location).toBe('Chicago, IL');
    expect(result.eventDate).toBe('2026-05-01T00:00:00.000Z');
  });

  it('sets isClosed deadline marker', () => {
    const result = makeResult({ cfpDeadline: null });
    const claudeMeta = { isClosed: true };
    mergeClaudeMetadata(result, claudeMeta);
    expect(new Date(result.cfpDeadline!).getFullYear()).toBe(2020);
  });

  it('overwrites format only when Claude provides one', () => {
    const result = makeResult({ format: 'conference' });
    const claudeMeta = { format: 'workshop' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.format).toBe('workshop');
  });

  it('keeps existing format when Claude returns undefined', () => {
    const result = makeResult({ format: 'podcast' });
    const claudeMeta = {};
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.format).toBe('podcast');
  });

  it('overwrites isRemote', () => {
    const result = makeResult({ isRemote: false });
    const claudeMeta = { isRemote: true };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.isRemote).toBe(true);
  });

  it('rejects invalid date strings from Claude', () => {
    const result = makeResult({ eventDate: null });
    const claudeMeta = { eventDate: 'not-a-date' };
    mergeClaudeMetadata(result, claudeMeta);
    expect(result.eventDate).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/liveSearchMetadataMerge.test.ts`
Expected: FAIL — `mergeClaudeMetadata` is not exported from `liveSearchService.js`

**Step 3: Commit**

```bash
git add server/src/services/liveSearchMetadataMerge.test.ts
git commit -m "test: add metadata merge tests for Claude-overwrites-regex behavior"
```

---

### Task 2: Extract and fix the metadata merge function

Extract the inline merge logic into an exported `mergeClaudeMetadata` function that lets Claude **overwrite** regex-extracted fields (not just fill gaps).

**Files:**
- Modify: `server/src/services/liveSearchService.ts:844-897`

**Step 1: Add the exported merge function**

Add this function before `enrichResultsFromPages` (around line 790):

```typescript
/**
 * Merge Claude-extracted metadata into a live result.
 * Claude data OVERWRITES regex-extracted data (not just fills gaps),
 * because Claude reads the actual page content and is more accurate.
 * Only skips overwrite when Claude returns undefined/null for a field.
 */
export function mergeClaudeMetadata(
  result: EnrichedLiveResult,
  claude: {
    eventDate?: string;
    cfpDeadline?: string;
    location?: string;
    isRemote?: boolean;
    isClosed?: boolean;
    compensationType?: string;
    format?: string;
    industries?: string[];
  }
): void {
  if (claude.eventDate && claude.eventDate !== 'null') {
    const d = new Date(claude.eventDate);
    if (!isNaN(d.getTime())) result.eventDate = d.toISOString();
  }
  if (claude.cfpDeadline && claude.cfpDeadline !== 'null') {
    const d = new Date(claude.cfpDeadline);
    if (!isNaN(d.getTime())) result.cfpDeadline = d.toISOString();
  }
  if (claude.location && claude.location !== 'null') {
    result.location = claude.location;
  }
  if (claude.isRemote !== undefined) {
    result.isRemote = claude.isRemote;
  }
  if (claude.compensationType && claude.compensationType !== 'null') {
    result.compensationType = claude.compensationType;
  }
  if (claude.format && claude.format !== 'null') {
    result.format = claude.format;
  }
  if (claude.industries && claude.industries.length > 0) {
    result.industries = normalizeIndustries(claude.industries);
  }
  if (claude.isClosed) {
    if (!result.cfpDeadline) {
      result.cfpDeadline = new Date('2020-01-01').toISOString();
    }
  }
}
```

**Step 2: Replace the inline merge in `enrichResultsFromPages`**

Replace lines 844-897 (the `for` loop that applies metadata) with:

```typescript
  // Apply extracted metadata to results — Claude overwrites regex data
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const claudeMeta = claudeResults.get(i);
    const pageText = pageTexts[i];

    if (claudeMeta) {
      mergeClaudeMetadata(r, claudeMeta);
    } else if (pageText) {
      // Fallback: regex extraction from page text (only when Claude failed)
      const pageMeta = extractMetadata(pageText, r.title, searchIndustries);
      if (!r.location && pageMeta.location) r.location = pageMeta.location;
      if (!r.cfpDeadline && pageMeta.cfpDeadline) r.cfpDeadline = pageMeta.cfpDeadline;
      if (!r.eventDate && pageMeta.eventDate) r.eventDate = pageMeta.eventDate;
      if (!r.compensationType && pageMeta.compensationType) {
        r.compensationType = pageMeta.compensationType;
        r.compensationAmount = pageMeta.compensationAmount;
        r.compensationDetails = pageMeta.compensationDetails;
      }
      if (!r.isRemote && pageMeta.isRemote) r.isRemote = true;
    }

    // Recalculate quality score with enriched data
    r.qualityScore = computeLiveQualityScore({
      cfpDeadline: r.cfpDeadline,
      eventDate: r.eventDate,
      location: r.location,
      industries: r.industries,
      compensationType: r.compensationType,
      description: r.description,
    });
  }
```

**Step 3: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/liveSearchMetadataMerge.test.ts`
Expected: All 10 tests PASS

**Step 4: Commit**

```bash
git add server/src/services/liveSearchService.ts
git commit -m "fix: let Claude overwrite regex-extracted metadata for accuracy"
```

---

### Task 3: Increase page text budget for Claude

The current 3000-char limit cuts off many pages before dates/venue info appears. Increase to 5000 and give Claude more per item.

**Files:**
- Modify: `server/src/services/liveSearchService.ts:700` (fetchPageText)
- Modify: `server/src/services/liveSearchService.ts:727` (charsPerItem in extractMetadataWithClaude)

**Step 1: Increase fetchPageText limit**

Change line 700 from:
```typescript
    return text.substring(0, 3000);
```
to:
```typescript
    return text.substring(0, 5000);
```

**Step 2: Increase Claude per-item budget**

Change line 727 from:
```typescript
  const charsPerItem = Math.min(1200, Math.floor(8000 / items.length));
```
to:
```typescript
  const charsPerItem = Math.min(2000, Math.floor(12000 / items.length));
```

**Step 3: Commit**

```bash
git add server/src/services/liveSearchService.ts
git commit -m "fix: increase page text budget so Claude can find dates and venues"
```

---

### Task 4: Hard-filter results by Claude-extracted location

After Claude enrichment, validate that each result's location actually matches the user's filter. Remove the broken backfill logic that assigns the user's location to unrelated results.

**Files:**
- Modify: `server/src/services/liveSearchService.ts:573-610` (location filtering block in `performLiveSearch`)

**Step 1: Move location filtering AFTER enrichment**

Currently, location filtering happens at line 573 — before `enrichResultsFromPages` is called (which happens inside `performLinkupSearch`). The problem is the filtering runs on regex-extracted locations, then enrichment happens inside `performLinkupSearch` on the already-filtered set.

Looking at the flow: `performLiveSearch` calls `performLinkupSearch` which internally calls `enrichResultsFromPages`. Then `performLiveSearch` applies post-filters at line 563+.

So the location filter at line 573 actually runs AFTER enrichment — good. The fix is to make it stricter and remove the backfill.

Replace the location filtering block (lines 573-610) with:

```typescript
  // 2. Filter by location — use Claude-extracted location as source of truth
  if (locations.length > 0) {
    const matched = results.filter(r => {
      // Only trust the structured location field (set by Claude or regex)
      if (!r.location) return false;
      const resultLoc = r.location.toLowerCase();
      return locations.some(loc => {
        const lowerLoc = loc.toLowerCase();
        // Direct match
        if (resultLoc.includes(lowerLoc)) return true;
        // Check aliases
        const aliases = locationAliasMap[lowerLoc] || [];
        return aliases.some(alias => resultLoc.includes(alias));
      });
    });

    if (matched.length >= 3) {
      results = matched;
    } else {
      // Not enough location matches — keep matched first, then fill with
      // results that have no location (benefit of the doubt), then others
      const noLocation = results.filter(r => !r.location && !matched.includes(r));
      const unmatched = results.filter(r => r.location && !matched.includes(r));
      results = [...matched, ...noLocation.slice(0, 4), ...unmatched.slice(0, Math.max(0, 8 - matched.length - noLocation.length))];
    }
  }
```

Key changes:
- Only matches against the structured `location` field, not free-text content
- No more backfill that stamps the user's location onto random results
- When few matches, prefers results with no location over results with wrong locations

**Step 2: Run the full test suite**

Run: `cd server && npx vitest run`
Expected: All existing tests still pass (this doesn't break any tested behavior)

**Step 3: Commit**

```bash
git add server/src/services/liveSearchService.ts
git commit -m "fix: hard-filter by Claude-extracted location, remove false backfill"
```

---

### Task 5: Improve the Claude extraction prompt

Add the current date to the prompt so Claude can identify past deadlines. Add instruction to always extract location even if it seems obvious. Add year validation.

**Files:**
- Modify: `server/src/services/liveSearchService.ts:732-749` (Claude prompt in `extractMetadataWithClaude`)

**Step 1: Update the prompt**

Replace the prompt string (lines 732-749) with:

```typescript
  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toISOString().split('T')[0];

  const prompt = `Extract metadata from these speaking opportunity pages. Return ONLY a JSON array, no other text.

Today's date is ${todayStr}.

For EACH item, extract:
- eventDate: when the event/conference takes place (YYYY-MM-DD). Use start date if range. This is NOT the submission deadline. Must be a real date, not a guess. null if not found.
- cfpDeadline: when speaker proposals/submissions are due (YYYY-MM-DD). This is NOT the event date. If the deadline text says "rolling" or "ongoing", return null. null if not found.
- location: the physical city and state/country where the event takes place, as "City, ST" or "City, Country". Extract this from venue information, not from the organization's headquarters. null if purely online or not found.
- isRemote: true if virtual/online/remote attendance option exists
- isClosed: true if the call for speakers/proposals is explicitly closed, or if cfpDeadline is before ${todayStr}
- compensationType: "paid"|"travel"|"honorarium"|"exposure" or null
- format: "conference"|"podcast"|"webinar"|"workshop"|"meetup"|"panel"
- industries: up to 3 relevant industry tags from the content

IMPORTANT RULES:
1. Distinguish submission deadlines from event dates. "Proposals due Sept 21" is cfpDeadline. "Conference May 4-6" is eventDate.
2. For location, extract WHERE THE EVENT PHYSICALLY HAPPENS, not where the organization is based or where speakers come from.
3. If a date has no year, assume ${currentYear} if the month hasn't passed yet, otherwise ${currentYear + 1}.
4. Return null for fields you cannot confidently determine. Do not guess.

Items:
${itemDescriptions}

Return format: [{"index":0,"eventDate":"2026-05-04","cfpDeadline":"2025-09-21","location":"Boston, MA","isRemote":false,"isClosed":false,"compensationType":"travel","format":"conference","industries":["healthcare","ai"]}, ...]`;
```

**Step 2: Commit**

```bash
git add server/src/services/liveSearchService.ts
git commit -m "fix: improve Claude prompt with date awareness and location precision"
```

---

### Task 6: Add location-aware quality scoring

Results matching the user's location filter should score higher. Results with populated dates should score significantly higher than "Date TBD" results.

**Files:**
- Modify: `server/src/services/liveSearchService.ts:271-287` (computeLiveQualityScore)
- Modify: `server/src/services/liveSearchService.ts` (call sites for computeLiveQualityScore)

**Step 1: Update the scoring function signature and logic**

Replace `computeLiveQualityScore` (lines 271-287) with:

```typescript
function computeLiveQualityScore(meta: {
  cfpDeadline: string | null;
  eventDate: string | null;
  location: string | null;
  industries: string[];
  compensationType: string | null;
  description: string | null;
  matchesLocationFilter?: boolean;
}) {
  let score = 10;
  if (meta.cfpDeadline) score += 25;
  if (meta.eventDate) score += 20;
  if (meta.location) score += 10;
  if (meta.industries && meta.industries.length > 0) score += 10;
  if (meta.compensationType) score += 10;
  if (meta.description && meta.description.length > 120) score += 5;
  if (meta.matchesLocationFilter) score += 10;
  return Math.min(100, score);
}
```

Key changes:
- Base score lowered from 20 → 10 (empty results should rank last)
- cfpDeadline weight increased 20 → 25 (most valuable signal)
- eventDate weight increased 15 → 20 (second most valuable)
- description weight lowered 10 → 5 (least meaningful)
- New +10 for matching location filter

**Step 2: Pass location filter context to scoring in `performLiveSearch`**

After the location filter block (after task 4's changes), before the remote/format/compensation filters, add a pass to recalculate scores with location context:

```typescript
  // Recalculate quality scores with location match context
  if (locations.length > 0) {
    for (const r of results) {
      const matchesLoc = r.location ? locations.some(loc => {
        const lowerLoc = loc.toLowerCase();
        const resultLoc = r.location!.toLowerCase();
        if (resultLoc.includes(lowerLoc)) return true;
        const aliases = locationAliasMap[lowerLoc] || [];
        return aliases.some(alias => resultLoc.includes(alias));
      }) : false;

      r.qualityScore = computeLiveQualityScore({
        cfpDeadline: r.cfpDeadline,
        eventDate: r.eventDate,
        location: r.location,
        industries: r.industries,
        compensationType: r.compensationType,
        description: r.description,
        matchesLocationFilter: matchesLoc,
      });
    }
  }
```

**Step 3: Update the two existing call sites**

The existing call sites in `performLinkupSearch` (line 959) and `enrichResultsFromPages` (line 889) don't have location filter context, which is fine — they just won't get the +10 bonus. No code change needed; the `matchesLocationFilter` param is optional and defaults to `undefined` (falsy).

**Step 4: Run the full test suite**

Run: `cd server && npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add server/src/services/liveSearchService.ts
git commit -m "feat: location-aware quality scoring, rebalanced weights"
```

---

### Task 7: Manual smoke test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test the exact scenario from the bug report**

1. Navigate to the app in browser
2. Search "health" with location filter "Los Angeles"
3. Verify:
   - Results have populated dates (not all "Date TBD")
   - Location field shows Claude-extracted locations, not backfilled "Los Angeles"
   - Results not in Los Angeles are either: genuinely in LA, have no location set, or are deprioritized
   - Swaay.Health shows "Boston" (or wherever it actually is), not "Los Angeles"

**Step 3: Test edge cases**

1. Search with no location filter — should work as before
2. Search with a niche location — should gracefully show fewer results rather than fake ones
3. Search with only industry filter — should work as before

**Step 4: Final commit if any tweaks needed**

```bash
git commit -m "fix: smoke test adjustments for live search data quality"
```

---

## Summary of Changes

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| Wrong locations (Swaay.Health showing "LA") | Backfill logic stamps user's location onto any result mentioning it | Remove backfill; hard-filter on structured `location` field |
| "Date TBD" when dates exist on page | Claude only fills missing fields; regex runs first and sets nothing | Claude now overwrites regex data as source of truth |
| Dates not extracted from pages | 3000-char page text limit cuts off content | Increased to 5000 chars, 2000/item for Claude |
| Irrelevant results ranked high | Base quality score of 20, no location bonus | Rebalanced: base 10, date weights up, location match bonus |
| Claude misses obvious dates | No date context in prompt, no year inference rules | Added today's date, year inference, explicit extraction rules |
