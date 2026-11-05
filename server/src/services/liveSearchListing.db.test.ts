import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { MAX_ENRICHMENT_ATTEMPTS } from './enrichmentBudget.js';
import { getListedByApplyUrls, getOpportunities } from './opportunityService.js';

/**
 * Against the test Postgres database: a search matches every word of the
 * query as a word (not the exact phrase), live-search hits stay hidden until
 * their page has been read, and stored copies of live hits are found by URL.
 */
const MARKER = 'live listing test row';
const now = new Date('2026-11-05T12:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

interface StoreInput {
  title: string;
  applyUrl: string;
  description?: string;
  source?: string;
  enrichmentStatus?: string | null;
  isClosed?: boolean;
  industries?: string[];
}

async function store(input: StoreInput) {
  return prisma.opportunity.create({
    data: {
      title: input.title,
      organization: 'Listing Test Org',
      applyUrl: input.applyUrl,
      format: 'conference',
      source: input.source ?? 'test-live-listing',
      cfpDeadline: inDays(30),
      qualityScore: 50,
      industries: JSON.stringify(input.industries ?? []),
      description: `${input.description ?? ''} ${MARKER}`.trim(),
      isClosed: input.isClosed ?? false,
      enrichmentStatus: input.enrichmentStatus === undefined ? 'enriched' : input.enrichmentStatus,
      // Pending rows must not be claimed by the enrichment-budget DB tests running alongside.
      enrichmentAttempts: input.enrichmentStatus === null ? MAX_ENRICHMENT_ATTEMPTS : 0,
    },
  });
}

async function reset() {
  await prisma.opportunity.deleteMany({ where: { description: { contains: MARKER } } });
}

const url = (slug: string) => `https://live-listing.example/${slug}`;

describe('stored search and live-search hits', () => {
  beforeAll(async () => {
    await reset();
    await store({ title: 'AI for PR Conference 2027', applyUrl: url('ai-for-pr') });
    await store({ title: 'Comms Leaders Forum', applyUrl: url('comms-forum'), description: 'Talks on AI tools for PR teams.' });
    await store({ title: 'Agency Summit', applyUrl: url('agency'), industries: ['ai'], description: 'Modern PR practice.' });
    // Contains "ai" and "pr" as letters only: "said", "April", "product".
    await store({ title: 'Retail Product Days', applyUrl: url('retail'), description: 'He said the April product launch went well.' });
    // A live hit stored from its snippet, page not read yet.
    await store({ title: 'AI PR Roundup', applyUrl: url('pending'), source: 'Live Search', enrichmentStatus: null });
    // A live hit whose read failed: still only the snippet, so it stays hidden too.
    await store({ title: 'AI PR Unreadable', applyUrl: url('failed'), source: 'Live Search', enrichmentStatus: 'failed' });
    // The same kind of hit once the worker has read it.
    await store({ title: 'AI PR Awards Call', applyUrl: url('read'), source: 'Live Search', enrichmentStatus: 'enriched' });
    await store({ title: 'AI PR Closed Call', applyUrl: url('closed'), isClosed: true });
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it('matches every word of the query instead of the exact phrase', async () => {
    const page = await getOpportunities({ search: 'AI for PR' }, { page: 1, pageSize: 50 }, { now });
    const titles = page.items.filter((item) => item.description?.includes(MARKER)).map((item) => item.title);
    expect(titles).toEqual(
      expect.arrayContaining(['AI for PR Conference 2027', 'Comms Leaders Forum', 'Agency Summit', 'AI PR Awards Call'])
    );
    expect(titles).not.toContain('Retail Product Days');
  });

  it('ranks the exact phrase in the title first', async () => {
    const page = await getOpportunities({ search: 'AI for PR' }, { page: 1, pageSize: 50 }, { now });
    expect(page.items[0].title).toBe('AI for PR Conference 2027');
  });

  it('counts only whole-word matches in the total', async () => {
    const page = await getOpportunities({ search: 'AI for PR' }, { page: 1, pageSize: 2 }, { now });
    const all = await getOpportunities({ search: 'AI for PR' }, { page: 1, pageSize: 50 }, { now });
    expect(page.total).toBe(all.items.length);
    expect(page.items).toHaveLength(2);
  });

  it('hides a live hit until its page has been read', async () => {
    const page = await getOpportunities({ search: 'Roundup' }, { page: 1, pageSize: 50 }, { now });
    expect(page.items.map((item) => item.title)).not.toContain('AI PR Roundup');
  });

  it('hides a live hit whose page could not be read', async () => {
    const page = await getOpportunities({ search: 'Unreadable' }, { page: 1, pageSize: 50 }, { now });
    expect(page.items).toEqual([]);
    expect(await getListedByApplyUrls([url('failed')], {}, { now })).toEqual([]);
  });

  it('finds the listed stored copies of live hits by URL, with the list visibility rules', async () => {
    const rows = await getListedByApplyUrls([url('ai-for-pr'), url('read'), url('pending'), url('closed'), url('unknown')], {}, { now });
    expect(rows.map((row) => row.title).sort()).toEqual(['AI PR Awards Call', 'AI for PR Conference 2027']);
  });

  it('applies the other active filters to stored copies', async () => {
    const rows = await getListedByApplyUrls([url('ai-for-pr')], { format: ['podcast'] }, { now });
    expect(rows).toEqual([]);
  });
});
