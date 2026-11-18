import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { MAX_ENRICHMENT_ATTEMPTS } from './enrichmentBudget.js';
import { getListedByApplyUrls, getOpportunities, getSectorOptions, getUniqueLocations } from './opportunityService.js';

/**
 * Against the test Postgres database: a search matches every word of the
 * query as a word (not the exact phrase), search hits (live and scheduled)
 * stay hidden until their own page has been read, rows whose event has
 * happened drop out, and stored copies of live hits are found by URL.
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
  /** When the page was last checked; defaults to "read today" for an enriched row. */
  verifiedAt?: Date | null;
  verificationError?: string | null;
  cfpDeadline?: Date | null;
  eventDate?: Date | null;
}

async function store(input: StoreInput) {
  return prisma.opportunity.create({
    data: {
      title: input.title,
      organization: 'Listing Test Org',
      applyUrl: input.applyUrl,
      format: 'conference',
      source: input.source ?? 'test-live-listing',
      cfpDeadline: input.cfpDeadline === undefined ? inDays(30) : input.cfpDeadline,
      eventDate: input.eventDate ?? null,
      verifiedAt: input.verifiedAt === undefined ? (input.enrichmentStatus === undefined ? now : null) : input.verifiedAt,
      verificationError: input.verificationError ?? null,
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
    await store({ title: 'AI PR Awards Call', applyUrl: url('read'), source: 'Live Search', enrichmentStatus: 'enriched', verifiedAt: now });
    await store({ title: 'AI PR Closed Call', applyUrl: url('closed'), isClosed: true });

    // Scheduled search hits follow the same rule as live ones.
    await store({ title: 'Gatecheck Waiting Hit', applyUrl: url('linkup-waiting'), source: 'Linkup Search', enrichmentStatus: null });
    // Enriched from the snippet because the page answered 403: never verified.
    await store({ title: 'Gatecheck Snippet Only', applyUrl: url('linkup-snippet'), source: 'Linkup Search', enrichmentStatus: 'enriched', verifiedAt: null });
    // Read once, but the last check could not fetch the page.
    await store({ title: 'Gatecheck Blocked Now', applyUrl: url('linkup-blocked'), source: 'Linkup Search', enrichmentStatus: 'enriched', verifiedAt: now, verificationError: 'HTTP 403' });
    // Skipped without a read: its page was unreadable.
    await store({ title: 'Gatecheck Unreadable', applyUrl: url('linkup-unreadable'), source: 'Linkup Search', enrichmentStatus: 'skipped' });
    await store({ title: 'Gatecheck Read Hit', applyUrl: url('linkup-read'), source: 'Linkup Search', enrichmentStatus: 'enriched', verifiedAt: now });
    // A CFP listing vouches for its rows: a failed check does not hide them.
    await store({ title: 'Gatecheck Listed Call', applyUrl: url('listed-blocked'), source: 'sessionize.com', verifiedAt: now, verificationError: 'HTTP 403' });
    await store({ title: 'Gatecheck Listed Unverified', applyUrl: url('listed-unverified'), source: 'confs.tech', enrichmentStatus: 'skipped' });

    // No deadline: listed until the event starts.
    await store({ title: 'Gatecheck Past Event', applyUrl: url('past-event'), cfpDeadline: null, eventDate: inDays(-3) });
    await store({ title: 'Gatecheck Upcoming Event', applyUrl: url('upcoming-event'), cfpDeadline: null, eventDate: inDays(40) });
    await store({ title: 'Gatecheck Rolling Call', applyUrl: url('rolling'), cfpDeadline: null, eventDate: null });
    // A deadline still open outranks an event date that looks past.
    await store({ title: 'Gatecheck Open Deadline', applyUrl: url('open-deadline'), cfpDeadline: inDays(10), eventDate: inDays(-3) });
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

  it('lists a scheduled search hit only once its own page has been read', async () => {
    const page = await getOpportunities({ search: 'Gatecheck' }, { page: 1, pageSize: 50 }, { now });
    const titles = page.items.map((item) => item.title);
    expect(titles).toContain('Gatecheck Read Hit');
    expect(titles).not.toContain('Gatecheck Waiting Hit');
    expect(titles).not.toContain('Gatecheck Snippet Only');
    expect(titles).not.toContain('Gatecheck Blocked Now');
    expect(titles).not.toContain('Gatecheck Unreadable');
  });

  it('keeps a listed call whose page could not be checked', async () => {
    const page = await getOpportunities({ search: 'Gatecheck' }, { page: 1, pageSize: 50 }, { now });
    const titles = page.items.map((item) => item.title);
    expect(titles).toContain('Gatecheck Listed Call');
    expect(titles).toContain('Gatecheck Listed Unverified');
  });

  it('drops a row with no deadline once its event has happened', async () => {
    const page = await getOpportunities({ search: 'Gatecheck' }, { page: 1, pageSize: 50 }, { now });
    const titles = page.items.map((item) => item.title);
    expect(titles).not.toContain('Gatecheck Past Event');
    expect(titles).toContain('Gatecheck Upcoming Event');
    expect(titles).toContain('Gatecheck Rolling Call');
    expect(titles).toContain('Gatecheck Open Deadline');
    expect(page.total).toBe(titles.length);
  });

  it('offers filter options from listed rows only', async () => {
    // The options read the clock, not the test's `now`: keep these two open whenever the test runs.
    const farDeadline = new Date('2099-01-01T00:00:00Z');
    const countOf = async (id: string) => (await getSectorOptions()).find((sector) => sector.id === id)!.count;
    const [aerospaceBefore, agricultureBefore] = await Promise.all([countOf('aerospace'), countOf('agriculture')]);
    await prisma.opportunity.updateMany({
      where: { applyUrl: url('linkup-snippet') },
      data: { location: 'Closes Sep', sectors: ['agriculture'], cfpDeadline: farDeadline },
    });
    await prisma.opportunity.updateMany({
      where: { applyUrl: url('linkup-read') },
      data: { location: 'Gatecheck City, NL', sectors: ['aerospace'], cfpDeadline: farDeadline },
    });
    const locations = await getUniqueLocations();
    expect(locations).toContain('Gatecheck City, NL');
    expect(locations).not.toContain('Closes Sep');
    // The listed row counts for its sector; the unread hit does not.
    expect(await countOf('aerospace')).toBe(aerospaceBefore + 1);
    expect(await countOf('agriculture')).toBe(agricultureBefore);
  });

  it('applies the other active filters to stored copies', async () => {
    const rows = await getListedByApplyUrls([url('ai-for-pr')], { format: ['podcast'] }, { now });
    expect(rows).toEqual([]);
  });
});
