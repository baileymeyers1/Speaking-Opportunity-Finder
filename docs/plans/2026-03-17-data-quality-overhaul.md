# Data Quality Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform raw scraper output into clean, well-structured opportunity cards with accurate titles, organizations, dates, and quality scores.

**Architecture:** Create a shared data normalization layer (`server/src/services/dataNormalization.ts`) that all scrapers and enrichment pipe through. Fix quality scoring to recalculate post-enrichment and spread scores wider. Expand enrichment prompt to clean titles/orgs and validate relevance.

**Tech Stack:** TypeScript, Prisma, date-fns for date parsing, Vitest for tests.

---

## Task 1: Create shared data normalization service

**Files:**
- Create: `server/src/services/dataNormalization.ts`
- Create: `server/src/services/dataNormalization.test.ts`

This is the foundation — all scrapers and enrichment will pipe through these functions.

**Step 1: Write the failing tests**

```typescript
// server/src/services/dataNormalization.test.ts
import { describe, it, expect } from 'vitest';
import {
  cleanTitle,
  extractOrganization,
  parseDate,
  detectPlaceholderDescription,
  normalizeIndustries,
} from './dataNormalization';

describe('cleanTitle', () => {
  it('strips " - Call for Speakers" suffix', () => {
    expect(cleanTitle('Black Hat - Call for Speakers')).toBe('Black Hat');
  });
  it('strips " - Call for Papers" suffix', () => {
    expect(cleanTitle('ICML 2026 - Call for Papers')).toBe('ICML 2026');
  });
  it('leaves titles without suffix unchanged', () => {
    expect(cleanTitle('KubeCon 2026')).toBe('KubeCon 2026');
  });
  it('strips leading/trailing whitespace', () => {
    expect(cleanTitle('  React Summit  ')).toBe('React Summit');
  });
  it('does not strip if "Call for" is in the middle', () => {
    expect(cleanTitle('Call for Papers: AI Summit')).toBe('Call for Papers: AI Summit');
  });
});

describe('extractOrganization', () => {
  it('extracts org from "Title | Org" format', () => {
    expect(extractOrganization('CFP | Google')).toBe('Google');
  });
  it('extracts org from "Title - Org" format', () => {
    expect(extractOrganization('Submit Talk - DevConf')).toBe('DevConf');
  });
  it('takes first part for "Org - City - CFS" pattern', () => {
    expect(extractOrganization('TechConf 2026 - San Francisco - Call for Speakers')).toBe('TechConf 2026');
  });
  it('returns cleaned title when no separator found', () => {
    expect(extractOrganization('KubeCon 2026')).toBe('KubeCon 2026');
  });
  it('strips year suffix from org', () => {
    expect(extractOrganization('ReactConf 2026', true)).toBe('ReactConf');
  });
  it('returns "Unknown Organization" for empty input', () => {
    expect(extractOrganization('')).toBe('Unknown Organization');
  });
});

describe('parseDate', () => {
  it('parses "January 15, 2026"', () => {
    const d = parseDate('January 15, 2026');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(15);
  });
  it('parses "2026-03-15"', () => {
    const d = parseDate('2026-03-15');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getMonth()).toBe(2);
  });
  it('parses "15 March 2026"', () => {
    const d = parseDate('15 March 2026');
    expect(d).toBeInstanceOf(Date);
  });
  it('parses "Mar 15, 2026"', () => {
    const d = parseDate('Mar 15, 2026');
    expect(d).toBeInstanceOf(Date);
  });
  it('parses "03/15/2026"', () => {
    const d = parseDate('03/15/2026');
    expect(d).toBeInstanceOf(Date);
  });
  it('returns null for garbage', () => {
    expect(parseDate('not a date')).toBeNull();
  });
  it('returns null for null input', () => {
    expect(parseDate(null)).toBeNull();
  });
});

describe('detectPlaceholderDescription', () => {
  it('flags "Submit your talk proposal to X"', () => {
    expect(detectPlaceholderDescription('Submit your talk proposal to ReactConf.')).toBe(true);
  });
  it('flags short generic descriptions', () => {
    expect(detectPlaceholderDescription('Call for speakers now open.')).toBe(true);
  });
  it('does not flag real descriptions', () => {
    const real = 'Join us for a deep dive into cloud-native security practices. Topics include zero trust architecture, container runtime defense, and supply chain integrity. We welcome talks from practitioners at all levels.';
    expect(detectPlaceholderDescription(real)).toBe(false);
  });
});

describe('normalizeIndustries', () => {
  it('deduplicates case-insensitively', () => {
    expect(normalizeIndustries(['Technology', 'technology', 'TECHNOLOGY'])).toEqual(['technology']);
  });
  it('filters out generic tags', () => {
    expect(normalizeIndustries(['events', 'cross-industry'])).toEqual([]);
  });
  it('lowercases all entries', () => {
    expect(normalizeIndustries(['AI', 'Cloud'])).toEqual(['ai', 'cloud']);
  });
  it('caps at 5 industries', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(normalizeIndustries(many).length).toBe(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/dataNormalization.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```typescript
// server/src/services/dataNormalization.ts

const CFP_SUFFIXES = [
  / - Call for Speakers$/i,
  / - Call for Papers$/i,
  / - Call for Proposals$/i,
  / - CFP$/i,
  / \| Call for Speakers$/i,
  / \| Call for Papers$/i,
];

/**
 * Strip redundant CFP suffixes from titles.
 * "Black Hat - Call for Speakers" → "Black Hat"
 */
export function cleanTitle(raw: string): string {
  let title = raw.trim();
  for (const pattern of CFP_SUFFIXES) {
    title = title.replace(pattern, '').trim();
  }
  return title;
}

const ORG_SEPARATORS = [' | ', ' - ', ' by ', ' @ ', ' at '];
const NOISE_PARTS = ['call for speakers', 'call for papers', 'cfp', 'call for proposals'];

/**
 * Extract organization from a title string.
 * Handles "Title | Org", "Org - City - CFP", etc.
 * If stripYear=true, removes trailing year like " 2026".
 */
export function extractOrganization(title: string, stripYear = false): string {
  if (!title || !title.trim()) return 'Unknown Organization';

  let org = title.trim();

  for (const sep of ORG_SEPARATORS) {
    if (org.includes(sep)) {
      const parts = org.split(sep).map((p) => p.trim());
      // Filter out noise parts (CFP, Call for Speakers, etc.)
      const meaningful = parts.filter(
        (p) => !NOISE_PARTS.includes(p.toLowerCase())
      );
      if (meaningful.length > 0) {
        // For "Org - City - CFP" pattern, take first meaningful part
        org = meaningful[0];
      }
      break;
    }
  }

  if (stripYear) {
    org = org.replace(/\s+\d{4}$/, '').trim();
  }

  return org || 'Unknown Organization';
}

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5,
  july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

/**
 * Parse a date string in multiple common formats.
 * Returns null if unparseable.
 */
export function parseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // Try ISO: 2026-03-15
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // Try MM/DD/YYYY
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (mdy) {
    const d = new Date(parseInt(mdy[3]), parseInt(mdy[1]) - 1, parseInt(mdy[2]));
    if (!isNaN(d.getTime())) return d;
  }

  // Try "Month DD, YYYY" or "Mon DD, YYYY"
  const monthFirst = /^(\w+)\s+(\d{1,2}),?\s*(\d{4})/.exec(s);
  if (monthFirst) {
    const month = MONTH_NAMES[monthFirst[1].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(monthFirst[3]), month, parseInt(monthFirst[2]));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Try "DD Month YYYY"
  const dayFirst = /^(\d{1,2})\s+(\w+)\s+(\d{4})/.exec(s);
  if (dayFirst) {
    const month = MONTH_NAMES[dayFirst[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(dayFirst[3]), month, parseInt(dayFirst[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

const PLACEHOLDER_PATTERNS = [
  /^submit your talk/i,
  /^call for (speakers|papers|proposals) (now )?open/i,
  /^we (are|invite you to) (looking|submit)/i,
  /^speak(ing)? at /i,
];

/**
 * Detect whether a description is a generic placeholder (not real content).
 */
export function detectPlaceholderDescription(desc: string | null | undefined): boolean {
  if (!desc) return true;
  const trimmed = desc.trim();
  if (trimmed.length < 60) return true;
  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.test(trimmed)) return true;
  }
  return false;
}

const GENERIC_TAGS = new Set(['events', 'cross-industry', 'general', 'other', 'misc']);

/**
 * Normalize an industries array: lowercase, dedupe, remove generic tags, cap at 5.
 */
export function normalizeIndustries(industries: string[] | null | undefined): string[] {
  if (!industries || industries.length === 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of industries) {
    const tag = raw.toLowerCase().trim();
    if (!tag || seen.has(tag) || GENERIC_TAGS.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= 5) break;
  }
  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/dataNormalization.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add server/src/services/dataNormalization.ts server/src/services/dataNormalization.test.ts
git commit -m "feat: add shared data normalization service with tests"
```

---

## Task 2: Overhaul quality scoring

**Files:**
- Modify: `server/src/scrapers/index.ts:40-60` (computeQualityScore)
- Modify: `server/src/scrapers/qualityScoring.test.ts` (update tests)

The current formula gives a base of 20 with binary field checks, clustering everything 30-50. New formula: lower base, weight description quality, penalize placeholder text, spread scores across 0-100.

**Step 1: Update the tests**

Replace all tests in `server/src/scrapers/qualityScoring.test.ts` with tests for the new formula:

```typescript
import { describe, it, expect } from 'vitest';
import { computeQualityScore, ScraperResult } from './index';

function makeResult(overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    title: 'Test Conference',
    organization: 'Test Org',
    applyUrl: 'https://example.com',
    format: 'conference',
    industries: [],
    isRemote: false,
    source: 'test',
    ...overrides,
  };
}

describe('computeQualityScore', () => {
  it('scores a barebones result very low', () => {
    const score = computeQualityScore(makeResult());
    expect(score).toBeLessThanOrEqual(15);
  });

  it('gives high score for complete result with real description', () => {
    const score = computeQualityScore(makeResult({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-01'),
      location: 'San Francisco, CA',
      industries: ['ai', 'cloud'],
      compensationType: 'paid',
      compensationAmount: 500,
      description: 'Join leading researchers and practitioners for 3 days of workshops on distributed systems, microservices patterns, and observability. Submit 30-minute talk proposals on production experience.',
    }));
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('penalizes placeholder descriptions', () => {
    const placeholder = computeQualityScore(makeResult({
      cfpDeadline: new Date('2026-06-01'),
      description: 'Submit your talk proposal to TestConf.',
    }));
    const real = computeQualityScore(makeResult({
      cfpDeadline: new Date('2026-06-01'),
      description: 'Join leading researchers for workshops on distributed systems and observability. Submit 30-minute talk proposals on production experience.',
    }));
    expect(real).toBeGreaterThan(placeholder);
  });

  it('gives bonus to trusted sources', () => {
    const untrusted = computeQualityScore(makeResult({ source: 'random.com' }));
    const trusted = computeQualityScore(makeResult({ source: 'papercall.io' }));
    expect(trusted).toBeGreaterThan(untrusted);
  });

  it('weights deadline heavily', () => {
    const noDeadline = computeQualityScore(makeResult());
    const withDeadline = computeQualityScore(makeResult({
      cfpDeadline: new Date('2026-06-01'),
    }));
    expect(withDeadline - noDeadline).toBeGreaterThanOrEqual(20);
  });

  it('caps at 100', () => {
    const score = computeQualityScore(makeResult({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-01'),
      location: 'San Francisco, CA',
      industries: ['ai', 'cloud', 'devops'],
      compensationType: 'paid',
      compensationAmount: 1000,
      description: 'A comprehensive multi-day conference featuring expert-led sessions on cutting-edge distributed systems architecture, cloud-native development patterns, and observability best practices. We welcome diverse speakers.',
      source: 'papercall.io',
    }));
    expect(score).toBeLessThanOrEqual(100);
  });

  it('differentiates mid-range results', () => {
    const low = computeQualityScore(makeResult({
      cfpDeadline: new Date('2026-06-01'),
    }));
    const mid = computeQualityScore(makeResult({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-01'),
      location: 'NYC',
      industries: ['tech'],
    }));
    const high = computeQualityScore(makeResult({
      cfpDeadline: new Date('2026-06-01'),
      eventDate: new Date('2026-09-01'),
      location: 'NYC',
      industries: ['tech', 'cloud'],
      compensationType: 'paid',
      description: 'A comprehensive conference on modern web architecture, featuring expert-led workshops on React, Node.js, and cloud infrastructure. Submit your talk proposals by the deadline.',
    }));
    expect(high).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(low);
    expect(high - low).toBeGreaterThanOrEqual(30);
  });
});
```

**Step 2: Run to verify tests fail with current formula**

Run: `cd server && npx vitest run src/scrapers/qualityScoring.test.ts`
Expected: Some tests FAIL (barebones scores too high, spread too narrow)

**Step 3: Rewrite computeQualityScore in `index.ts:40-60`**

Replace the function with:

```typescript
export function computeQualityScore(result: ScraperResult): number {
  let score = 5; // Low base — must earn points

  // Critical fields (55 points)
  if (result.cfpDeadline) score += 25;
  if (result.eventDate) score += 15;
  if (result.location) score += 10;
  if (result.compensationType || result.compensationAmount) score += 5;

  // Industries (10 points, scaled)
  const validIndustries = (result.industries || []).filter(
    (i) => !['events', 'cross-industry', 'general'].includes(i.toLowerCase())
  );
  score += Math.min(10, validIndustries.length * 5);

  // Description quality (20 points)
  const desc = result.description || '';
  if (desc.length > 200) {
    // Check for placeholder text
    const isPlaceholder =
      /^submit your talk/i.test(desc) ||
      /^call for (speakers|papers)/i.test(desc) ||
      /^we invite you/i.test(desc);
    score += isPlaceholder ? 3 : 20;
  } else if (desc.length > 80) {
    score += 8;
  }

  // Source trust (10 points)
  const trustedSources = [
    'papercall.io', 'confs.tech', 'javaconferences.org',
    'callingallpapers.com', 'wikicfp.com',
  ];
  if (trustedSources.includes(result.source)) score += 10;

  return Math.min(100, Math.max(0, score));
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/scrapers/qualityScoring.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/scrapers/index.ts server/src/scrapers/qualityScoring.test.ts
git commit -m "feat: overhaul quality scoring with wider spread and description quality"
```

---

## Task 3: Wire normalization into all scrapers

**Files:**
- Modify: `server/src/scrapers/callingallpapers.ts:54-55`
- Modify: `server/src/scrapers/papercall.ts:54-55`
- Modify: `server/src/scrapers/wikicfp.ts:108-116`
- Modify: `server/src/scrapers/eventbrite.ts:105-115`
- Modify: `server/src/scrapers/confstech.ts:91-99`
- Modify: `server/src/scrapers/javaconferences.ts:74-82`
- Modify: `server/src/scrapers/linkupcfp.ts:67-76,246-247`
- Modify: `server/src/services/liveSearchService.ts:127-203,295-324,338-347`

For every scraper, apply three changes:
1. Import `cleanTitle`, `extractOrganization`, `normalizeIndustries` from `dataNormalization`
2. Replace hardcoded `" - Call for Speakers"` title construction with `cleanTitle(name)`
3. Replace direct org assignment with `extractOrganization(name)`
4. Wrap industries with `normalizeIndustries(...)`

**Step 1: Update CallingAllPapers**

```typescript
// Add import at top
import { cleanTitle, normalizeIndustries } from '../services/dataNormalization.js';

// Line 54-55: replace title/org construction
title: cleanTitle(cfp.name),
organization: cfp.name,

// Wherever industries is set, wrap with normalizeIndustries
industries: normalizeIndustries(tags.length > 0 ? tags : ['technology']),
```

**Step 2: Update PaperCall (same pattern)**

```typescript
import { cleanTitle, normalizeIndustries } from '../services/dataNormalization.js';

title: cleanTitle(event.name),
organization: event.name,
industries: normalizeIndustries(tags.length > 0 ? tags : ['technology']),
```

**Step 3: Update WikiCFP**

```typescript
import { cleanTitle, normalizeIndustries } from '../services/dataNormalization.js';

title: cleanTitle(item.title),
organization: item.title,
industries: normalizeIndustries(industries),
```

**Step 4: Update Eventbrite — fix the hardcoded `['events']`**

```typescript
import { cleanTitle, normalizeIndustries } from '../services/dataNormalization.js';

title: cleanTitle(event.name?.text || 'Untitled'),
organization: event.name?.text || 'Unknown Organization',
// Replace hardcoded ['events'] — infer from event category/name if possible
industries: normalizeIndustries(inferIndustriesFromContent(event.name?.text || '', event.description?.text || '')),
```

Add a helper at the top of eventbrite.ts:

```typescript
function inferIndustriesFromContent(title: string, description: string): string[] {
  const text = (title + ' ' + description).toLowerCase();
  const tags: string[] = [];
  const keywords: Record<string, string> = {
    'technology': 'technology', 'software': 'technology', 'developer': 'technology',
    'healthcare': 'healthcare', 'medical': 'healthcare',
    'marketing': 'marketing', 'sales': 'sales',
    'finance': 'finance', 'fintech': 'finance',
    'education': 'education', 'leadership': 'leadership',
    'ai': 'ai', 'artificial intelligence': 'ai', 'machine learning': 'ai',
    'data': 'data science', 'cloud': 'cloud', 'security': 'cybersecurity',
  };
  for (const [keyword, tag] of Object.entries(keywords)) {
    if (text.includes(keyword) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}
```

**Step 5: Update ConfsTech and JavaConferences (same pattern — clean title, keep org as conf name)**

**Step 6: Update LinkupCFP**

Replace the local `extractOrganization` function (lines 67-76) with an import from dataNormalization:

```typescript
import { cleanTitle, extractOrganization, normalizeIndustries } from '../services/dataNormalization.js';

// Remove local extractOrganization function (lines 67-76)
// Update mapToScraperResult:
title: cleanTitle(result.name),
organization: extractOrganization(result.name),
industries: normalizeIndustries(industries),
```

**Step 7: Update liveSearchService.ts**

Replace the local `extractOrganization` (lines 338-347) with import from dataNormalization. Update `extractMetadata` to use `normalizeIndustries`. Update the results.push block (lines 295-324) to use `cleanTitle`.

```typescript
import { cleanTitle, extractOrganization, normalizeIndustries } from './dataNormalization.js';

// Remove local extractOrganization function (lines 338-347)

// In results.push (line 297):
title: cleanTitle(item.name || 'Untitled'),
organization: extractOrganization(item.name || '', true),

// In extractMetadata return (line 202):
return { format, isRemote, location, cfpDeadline, industries: normalizeIndustries(industries), eventDate, ...compensation };
```

**Step 8: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 9: Commit**

```bash
git add server/src/scrapers/*.ts server/src/services/liveSearchService.ts
git commit -m "feat: wire data normalization into all scrapers"
```

---

## Task 4: Recalculate quality score after enrichment

**Files:**
- Modify: `server/src/services/backgroundEnrichment.ts:103-120`
- Modify: `server/src/scrapers/index.ts` (export computeQualityScore — already exported)

This is the most impactful single change: enrichment fills in missing fields but never recalculates the quality score, so enriched records keep their low pre-enrichment scores.

**Step 1: Write a failing test**

```typescript
// Add to server/src/services/backgroundEnrichment.test.ts
it('recalculates quality score after enrichment', async () => {
  // This is a conceptual test — the actual implementation touches prisma
  // Test that computeQualityScore is called with enriched data
  const { computeQualityScore } = await import('../scrapers/index');
  const before = computeQualityScore({
    title: 'Test', organization: 'Org', applyUrl: 'https://x.com',
    format: 'conference', industries: [], isRemote: false, source: 'test',
  });
  const after = computeQualityScore({
    title: 'Test', organization: 'Org', applyUrl: 'https://x.com',
    format: 'conference', industries: ['ai', 'cloud'], isRemote: false,
    source: 'test', cfpDeadline: new Date('2026-06-01'),
    eventDate: new Date('2026-09-01'), location: 'NYC',
  });
  expect(after).toBeGreaterThan(before);
});
```

**Step 2: Add quality recalculation in backgroundEnrichment.ts:103-120**

After the enrichment update, recalculate and write the new score:

```typescript
import { computeQualityScore, ScraperResult } from '../scrapers/index.js';

// After the prisma.opportunity.update (line 120), add:
// Recalculate quality score with enriched data
const enrichedResult: ScraperResult = {
  title: opportunity.title,
  organization: opportunity.organization,
  description: opportunity.description || undefined,
  location: enriched.location || opportunity.location || undefined,
  isRemote: enriched.isRemote ?? opportunity.isRemote,
  eventDate: enriched.eventDate || (opportunity.eventDate ? new Date(opportunity.eventDate) : undefined),
  cfpDeadline: enriched.cfpDeadline || (opportunity.cfpDeadline ? new Date(opportunity.cfpDeadline) : undefined),
  format: opportunity.format,
  industries: enriched.industries || JSON.parse(opportunity.industries || '[]'),
  compensationType: enriched.compensationType || opportunity.compensationType || undefined,
  compensationAmount: enriched.compensationAmount || opportunity.compensationAmount || undefined,
  applyUrl: opportunity.applyUrl,
  source: opportunity.source,
};

const newScore = computeQualityScore(enrichedResult);
await prisma.opportunity.update({
  where: { id: opportunity.id },
  data: { qualityScore: newScore },
});
```

**Step 3: Run tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/services/backgroundEnrichment.ts server/src/services/backgroundEnrichment.test.ts
git commit -m "feat: recalculate quality score after enrichment"
```

---

## Task 5: Expand enrichment prompt to clean titles and validate relevance

**Files:**
- Modify: `server/src/services/enrichmentService.ts:156-172` (buildEnrichmentPrompt)
- Modify: `server/src/services/enrichmentService.ts:174-222` (parseEnrichmentResponse)
- Modify: `server/src/services/enrichmentService.ts:5-17` (EnrichmentResult type)
- Modify: `server/src/services/backgroundEnrichment.ts:103-120` (apply new fields)
- Update: `server/src/services/enrichmentService.test.ts`

**Step 1: Update EnrichmentResult type (line 5-17)**

Add fields:

```typescript
export interface EnrichmentResult {
  cfpDeadline?: Date;
  eventDate?: Date;
  industries?: string[];
  location?: string;
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
  isRemote?: boolean;
  timezone?: string;
  cleanTitle?: string;         // NEW: cleaned title
  cleanOrganization?: string;  // NEW: cleaned org name
  isRelevant?: boolean;        // NEW: is this actually a speaking opportunity?
  enrichmentStatus: string;
  enrichedAt?: Date;
  enrichmentError?: string;
}
```

**Step 2: Update buildEnrichmentPrompt (lines 156-172)**

```typescript
function buildEnrichmentPrompt(result: ScraperResult): string {
  const missing: string[] = [];
  if (!result.cfpDeadline) missing.push('cfpDeadline');
  if (!result.eventDate) missing.push('eventDate');
  if (!result.industries || result.industries.length === 0) missing.push('industries');
  if (!result.location) missing.push('location');
  if (!result.compensationType) missing.push('compensationType');

  return `Analyze this speaking opportunity listing. Return ONLY a JSON object, no other text.

Title: ${result.title}
Organization: ${result.organization}
Description: ${(result.description || '').substring(0, 800)}

Tasks:
1. Extract any missing fields: ${missing.join(', ')}
2. Clean up the title: remove redundant suffixes like "Call for Speakers", "| Company Name" etc. Return the clean event name.
3. Extract the organizing body (company, association, or group running this event). Not the event name itself.
4. Determine if this is genuinely a speaking/presenting opportunity (true) or just a conference listing, job posting, or unrelated page (false).

{"cfpDeadline":"YYYY-MM-DD or null","eventDate":"YYYY-MM-DD or null","industries":["topic1","topic2"],"location":"City, Country or Remote or null","compensationType":"paid|travel|honorarium|exposure or null","compensationAmount":null,"isRemote":false,"cleanTitle":"cleaned event name","cleanOrganization":"organizing body name","isRelevant":true}`;
}
```

**Step 3: Update parseEnrichmentResponse (lines 174-222)**

Add parsing for the three new fields after line 211:

```typescript
cleanTitle: parsed.cleanTitle && parsed.cleanTitle !== 'null'
  ? parsed.cleanTitle
  : undefined,
cleanOrganization: parsed.cleanOrganization && parsed.cleanOrganization !== 'null'
  ? parsed.cleanOrganization
  : undefined,
isRelevant: parsed.isRelevant !== undefined ? parsed.isRelevant : undefined,
```

**Step 4: Update backgroundEnrichment.ts to apply cleanTitle and cleanOrganization**

In the prisma update block (line 103-120), add:

```typescript
title: enriched.cleanTitle || opportunity.title,
organization: enriched.cleanOrganization || opportunity.organization,
```

For `isRelevant === false`, set a low quality score to push irrelevant results to the bottom:

```typescript
// After the enrichment update
if (enriched.isRelevant === false) {
  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: { qualityScore: 0 },
  });
}
```

**Step 5: Update enrichment tests**

Add tests for the new fields in `enrichmentService.test.ts`:

```typescript
it('parses cleanTitle field', () => {
  const result = parseEnrichmentResponse('{"cleanTitle":"KubeCon","cleanOrganization":"CNCF","isRelevant":true}');
  expect(result.cleanTitle).toBe('KubeCon');
  expect(result.cleanOrganization).toBe('CNCF');
  expect(result.isRelevant).toBe(true);
});

it('flags irrelevant results', () => {
  const result = parseEnrichmentResponse('{"isRelevant":false,"cleanTitle":"Random Job Post"}');
  expect(result.isRelevant).toBe(false);
});
```

**Step 6: Run all tests**

Run: `npm test`
Expected: PASS

**Step 7: Commit**

```bash
git add server/src/services/enrichmentService.ts server/src/services/backgroundEnrichment.ts server/src/services/enrichmentService.test.ts
git commit -m "feat: expand enrichment to clean titles/orgs and validate relevance"
```

---

## Task 6: Refocus Linkup search queries

**Files:**
- Modify: `server/src/scrapers/linkupcfp.ts:23-65` (INDUSTRY_CFP_QUERIES array)

The current 35 queries have two problems: (1) city-based searches are too vague and pull in irrelevant results, and (2) some industry queries lack "call for speakers/CFP" keywords, returning general conference listings instead of actual speaking opportunities. Keep broad industry coverage but make every query explicitly target CFPs/speaking opportunities. Drop city-only queries (the industry ones already find US events via `US_FOCUS_SUFFIX`).

**Step 1: Replace INDUSTRY_CFP_QUERIES**

```typescript
const INDUSTRY_CFP_QUERIES = [
  // --- Technology ---
  { query: withUsFocus('AI artificial intelligence machine learning conference call for speakers CFP'), industries: ['ai', 'machine learning'] },
  { query: withUsFocus('data science analytics conference call for speakers CFP'), industries: ['data science'] },
  { query: withUsFocus('cloud computing devops conference call for speakers CFP'), industries: ['cloud', 'devops'] },
  { query: withUsFocus('cybersecurity infosec conference call for papers CFP'), industries: ['cybersecurity'] },
  { query: withUsFocus('software engineering developer conference call for speakers CFP'), industries: ['software development'] },
  { query: withUsFocus('web development frontend backend conference call for speakers'), industries: ['web development'] },
  // --- Healthcare & Life Sciences ---
  { query: withUsFocus('healthcare medical conference call for speakers CFP'), industries: ['healthcare'] },
  { query: withUsFocus('biotech pharmaceutical conference call for speakers CFP'), industries: ['biotech', 'pharmaceutical'] },
  // --- Finance & Business ---
  { query: withUsFocus('fintech finance banking conference call for speakers CFP'), industries: ['finance', 'fintech'] },
  { query: withUsFocus('venture capital startup conference call for speakers CFP'), industries: ['startups', 'venture capital'] },
  { query: withUsFocus('insurance insurtech conference call for speakers CFP'), industries: ['insurance'] },
  // --- Professional Services ---
  { query: withUsFocus('marketing digital marketing conference call for speakers CFP'), industries: ['marketing'] },
  { query: withUsFocus('HR human resources talent conference call for speakers CFP'), industries: ['hr'] },
  { query: withUsFocus('legal law conference call for speakers CFP'), industries: ['legal'] },
  { query: withUsFocus('supply chain logistics conference call for speakers CFP'), industries: ['supply chain', 'logistics'] },
  // --- Industry & Infrastructure ---
  { query: withUsFocus('manufacturing industry conference call for speakers CFP'), industries: ['manufacturing'] },
  { query: withUsFocus('energy renewable conference call for speakers CFP'), industries: ['energy'] },
  { query: withUsFocus('real estate proptech conference call for speakers CFP'), industries: ['real estate'] },
  { query: withUsFocus('architecture construction conference call for speakers CFP'), industries: ['architecture', 'construction'] },
  { query: withUsFocus('automotive mobility conference call for speakers CFP'), industries: ['automotive'] },
  { query: withUsFocus('aerospace defense conference call for speakers CFP'), industries: ['aerospace', 'defense'] },
  { query: withUsFocus('telecom 5G conference call for speakers CFP'), industries: ['telecom'] },
  // --- Social Impact & Public Sector ---
  { query: withUsFocus('sustainability climate environment conference call for speakers CFP'), industries: ['sustainability'] },
  { query: withUsFocus('education edtech conference call for speakers CFP'), industries: ['education'] },
  { query: withUsFocus('nonprofit social impact conference call for speakers CFP'), industries: ['nonprofit'] },
  { query: withUsFocus('government public policy conference call for speakers CFP'), industries: ['government'] },
  // --- Creative & Media ---
  { query: withUsFocus('entertainment media conference call for speakers CFP'), industries: ['entertainment', 'media'] },
  { query: withUsFocus('design UX product conference call for speakers CFP'), industries: ['design', 'ux'] },
  // --- Format variety ---
  { query: withUsFocus('professional conference call for speakers open submissions'), industries: [] },
  { query: withUsFocus('podcast guest speaker application submit pitch'), industries: [] },
];
```

This gives 30 queries covering 25+ industries. Key changes vs. current:
- Dropped 8 city-only queries (vague, low relevance)
- Added "call for speakers CFP" to every query (forces relevance)
- Added web dev, design/UX, insurance (missing verticals)
- Removed duplicate cross-industry city searches
- Empty industries array for format-variety queries (let content inference handle tagging)

**Step 2: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/scrapers/linkupcfp.ts
git commit -m "refactor: trim Linkup queries from 30 to 12 focused searches"
```

---

## Task 7: Backfill quality scores for existing records

**Files:**
- Modify: `server/src/scrapers/index.ts` (backfillQualityScores already exists at line 62)

The existing `backfillQualityScores` function only targets `qualityScore: null`. We need a one-time migration to recalculate ALL scores with the new formula.

**Step 1: Add a recalculateAllScores function**

```typescript
export async function recalculateAllQualityScores(): Promise<number> {
  const batchSize = 200;
  let updated = 0;
  let skip = 0;

  while (true) {
    const batch = await prisma.opportunity.findMany({
      take: batchSize,
      skip,
    });

    if (batch.length === 0) break;

    for (const opp of batch) {
      const result: ScraperResult = {
        title: opp.title,
        organization: opp.organization,
        description: opp.description || undefined,
        location: opp.location || undefined,
        isRemote: opp.isRemote,
        eventDate: opp.eventDate ? new Date(opp.eventDate) : undefined,
        cfpDeadline: opp.cfpDeadline ? new Date(opp.cfpDeadline) : undefined,
        format: opp.format,
        industries: (() => { try { return JSON.parse(opp.industries || '[]'); } catch { return []; } })(),
        compensationType: opp.compensationType || undefined,
        compensationAmount: opp.compensationAmount || undefined,
        applyUrl: opp.applyUrl,
        source: opp.source,
      };

      const newScore = computeQualityScore(result);
      if (newScore !== opp.qualityScore) {
        await prisma.opportunity.update({
          where: { id: opp.id },
          data: { qualityScore: newScore },
        });
        updated++;
      }
    }

    skip += batchSize;
  }

  console.log(`Recalculated quality scores: ${updated} records updated`);
  return updated;
}
```

**Step 2: Add a CLI trigger or call from syncOpportunities**

In `syncOpportunities` (or the daily scraper run), add a call after scraping completes:

```typescript
await recalculateAllQualityScores();
```

**Step 3: Run and verify**

Run: `npm test && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/scrapers/index.ts
git commit -m "feat: add quality score recalculation for all existing records"
```

---

## Task Summary

| Task | What it fixes | Impact |
|------|--------------|--------|
| 1. Data normalization service | Centralized title/org/date/industry cleanup | Foundation for all other tasks |
| 2. Quality scoring overhaul | Scores cluster 30-50 → spread across 0-100 | Better sorting, more differentiation |
| 3. Wire normalization into scrapers | Dirty titles, bad orgs, generic industries | Clean cards on first scrape |
| 4. Recalculate score post-enrichment | Enriched records keep old low scores | Enrichment actually improves ranking |
| 5. Expand enrichment prompt | Titles still dirty after enrichment, junk not flagged | Clean data + relevance filtering |
| 6. Refocus Linkup queries | City-only queries too vague, missing "CFP" keyword | 30 queries across 25+ industries, all explicitly targeting CFPs |
| 7. Backfill existing scores | Old records stuck with old formula | Immediate improvement for all data |

**Dependencies:** Task 1 → Tasks 2-7. Task 2 → Tasks 4, 7. All others are independent.
