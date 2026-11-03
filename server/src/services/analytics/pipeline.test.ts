import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({ prisma: {} }));

import { buildPipelineEvents, latestOf, PIPELINE_EVENT_LIMIT } from './pipeline.js';

const at = (iso: string) => new Date(iso);

describe('buildPipelineEvents', () => {
  it('merges runs, enrichments and verifications newest first with readable summaries', () => {
    const events = buildPipelineEvents({
      runs: [
        {
          scraper: 'confs.tech',
          status: 'ok',
          startedAt: at('2026-11-03T06:00:00Z'),
          finishedAt: at('2026-11-03T06:00:05Z'),
          found: 19,
          added: 2,
          updated: 17,
          error: null,
        },
        {
          scraper: 'wikicfp.com',
          status: 'error',
          startedAt: at('2026-11-02T08:00:00Z'),
          finishedAt: at('2026-11-02T08:00:45Z'),
          found: 0,
          added: 0,
          updated: 0,
          error: 'wikicfp.com timed out after 45s',
        },
        {
          scraper: 'linkup',
          status: 'running',
          startedAt: at('2026-11-03T07:00:00Z'),
          finishedAt: null,
          found: 0,
          added: 0,
          updated: 0,
          error: null,
        },
      ],
      enriched: [
        { title: 'DevConf', enrichedAt: at('2026-11-03T06:30:00Z'), enrichmentStatus: 'enriched', enrichmentError: null, isClosed: true, isRelevant: true },
        { title: 'Spam', enrichedAt: at('2026-11-03T06:20:00Z'), enrichmentStatus: 'failed', enrichmentError: 'rate limited', isClosed: false, isRelevant: true },
      ],
      verified: [
        { title: 'PyCon', verifiedAt: at('2026-11-03T06:40:00Z'), verificationError: null, isClosed: false },
        { title: 'Gone Conf', verifiedAt: at('2026-11-03T06:10:00Z'), verificationError: 'fetch failed', isClosed: false },
      ],
    });

    expect(events.map((e) => e.at)).toEqual([
      '2026-11-03T06:40:00.000Z',
      '2026-11-03T06:30:00.000Z',
      '2026-11-03T06:20:00.000Z',
      '2026-11-03T06:10:00.000Z',
      '2026-11-03T06:00:05.000Z',
      '2026-11-02T08:00:45.000Z',
    ]);
    expect(events[0]).toMatchObject({ kind: 'verification', status: 'ok', summary: 'Verified "PyCon"', detail: null });
    expect(events[1]).toMatchObject({ kind: 'enrichment', status: 'ok', summary: 'Enriched "DevConf"', detail: 'Marked closed' });
    expect(events[2]).toMatchObject({ kind: 'enrichment', status: 'error', summary: 'Gave up on "Spam"', detail: 'rate limited' });
    expect(events[3]).toMatchObject({ kind: 'verification', status: 'error', summary: 'Could not verify "Gone Conf"' });
    expect(events[4]).toMatchObject({ kind: 'scraper-run', status: 'ok', summary: 'confs.tech: 19 found, 2 added, 17 updated' });
    expect(events[5]).toMatchObject({ kind: 'scraper-run', status: 'error', summary: 'wikicfp.com: run failed', detail: 'wikicfp.com timed out after 45s' });
  });

  it('notes a zero-row run and caps the list', () => {
    const runs = Array.from({ length: PIPELINE_EVENT_LIMIT + 5 }, (_, i) => ({
      scraper: 'confs.tech',
      status: 'ok',
      startedAt: at(`2026-10-${String(10 + i).padStart(2, '0')}T06:00:00Z`),
      finishedAt: null,
      found: 0,
      added: 0,
      updated: 0,
      error: null,
    }));
    const events = buildPipelineEvents({ runs, enriched: [], verified: [] });
    expect(events).toHaveLength(PIPELINE_EVENT_LIMIT);
    expect(events[0].detail).toBe('Returned no rows');
    expect(events[0].at > events[1].at).toBe(true);
  });

  it('treats a gone page as a successful verification that closed the row', () => {
    const [event] = buildPipelineEvents({
      runs: [],
      enriched: [],
      verified: [{ title: 'Old Conf', verifiedAt: at('2026-11-01T00:00:00Z'), verificationError: 'Page unavailable: 404', isClosed: true }],
    });
    expect(event).toMatchObject({ status: 'ok', detail: 'Now closed: Page unavailable: 404' });
  });
});

describe('latestOf', () => {
  it('returns the newest non-null date as ISO, or null', () => {
    expect(latestOf(null, at('2026-01-01T00:00:00Z'), at('2026-02-01T00:00:00Z'), undefined)).toBe('2026-02-01T00:00:00.000Z');
    expect(latestOf(null, undefined)).toBeNull();
  });
});
