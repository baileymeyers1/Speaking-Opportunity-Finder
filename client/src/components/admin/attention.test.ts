import { describe, it, expect } from 'vitest';
import { ATTENTION_THRESHOLDS, deriveAttention } from './attention';
import type { AdminPipelineResponse, AdminSourceHealth } from '../../types';

const NOW = new Date('2026-11-03T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

function source(overrides: Partial<AdminSourceHealth>): AdminSourceHealth {
  return {
    name: 'confs.tech',
    cadence: 'daily',
    registered: true,
    status: 'healthy',
    lastRun: null,
    consecutiveEmptyRuns: 0,
    sparkline: [],
    rows: { total: 0, active: 0, enriched: 0, verified: 0, closed: 0 },
    ...overrides,
  };
}

function healthyPipeline(overrides: Partial<AdminPipelineResponse> = {}): AdminPipelineResponse {
  return {
    enrichment: { backlog: 0, claimed: 0, staleClaims: 0, failed: 0, enrichedLast24h: 5, lastEnrichedAt: iso(HOUR) },
    budget: { date: '2026-11-03', used: 40, limit: 200 },
    verification: { due: 0, dueDeadlineSoon: 0, dueStale: 0, withError: 0, lowConfidenceDates: 0, verifiedLast24h: 3, lastVerifiedAt: iso(HOUR) },
    crons: { dailySyncAt: iso(6 * HOUR), weeklySyncAt: iso(2 * 24 * HOUR), enrichmentAt: iso(HOUR), enrichmentHasWork: false },
    events: [],
    generatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('deriveAttention', () => {
  it('is empty when every source is healthy and the pipeline is current', () => {
    expect(deriveAttention({ sources: [source({})], pipeline: healthyPipeline(), now: NOW })).toEqual([]);
  });

  it('handles missing sections while they load', () => {
    expect(deriveAttention({ now: NOW })).toEqual([]);
  });

  it('flags a failing source as critical and a warning source as a warning', () => {
    const items = deriveAttention({
      sources: [
        source({ name: 'wikicfp.com', status: 'warning', consecutiveEmptyRuns: 1 }),
        source({ name: 'papercall.io', status: 'retired', consecutiveEmptyRuns: 9, registered: false }),
        source({ name: 'confs.tech', status: 'failing', consecutiveEmptyRuns: 3 }),
      ],
      now: NOW,
    });
    expect(items.map((i) => [i.id, i.severity])).toEqual([
      ['source-failing-confs.tech', 'critical'],
      ['source-warning-wikicfp.com', 'warning'],
    ]);
    expect(items[0].title).toBe('confs.tech is failing');
    expect(items[0].detail).toContain('3 runs in a row');
  });

  it('flags budget exhaustion as critical and a nearly used budget as a warning', () => {
    const exhausted = deriveAttention({ pipeline: healthyPipeline({ budget: { date: 'd', used: 200, limit: 200 } }), now: NOW });
    expect(exhausted.map((i) => i.id)).toEqual(['budget-exhausted']);
    const low = deriveAttention({ pipeline: healthyPipeline({ budget: { date: 'd', used: 185, limit: 200 } }), now: NOW });
    expect(low.map((i) => [i.id, i.severity])).toEqual([['budget-low', 'warning']]);
  });

  it('flags stale claims and a verification backlog over the threshold', () => {
    const pipeline = healthyPipeline();
    pipeline.enrichment.staleClaims = 2;
    pipeline.verification.due = ATTENTION_THRESHOLDS.verificationBacklog + 1;
    pipeline.verification.dueDeadlineSoon = 7;
    const items = deriveAttention({ pipeline, now: NOW });
    expect(items.map((i) => i.id)).toEqual(['stale-claims', 'verification-backlog']);
    expect(items[0].title).toBe('2 stale enrichment claims');
    expect(items[1].title).toBe('51 rows overdue for verification');
  });

  it('does not flag a verification backlog at the threshold', () => {
    const pipeline = healthyPipeline();
    pipeline.verification.due = ATTENTION_THRESHOLDS.verificationBacklog;
    expect(deriveAttention({ pipeline, now: NOW })).toEqual([]);
  });

  it('flags crons that have not run when expected', () => {
    const pipeline = healthyPipeline({
      crons: { dailySyncAt: iso(27 * HOUR), weeklySyncAt: iso(9 * 24 * HOUR), enrichmentAt: iso(20 * 60 * 1000), enrichmentHasWork: true },
    });
    const items = deriveAttention({ pipeline, now: NOW });
    expect(items.map((i) => i.id)).toEqual(['cron-daily', 'cron-weekly', 'cron-enrichment']);
    expect(items[0].detail).toBe('Last daily scraper run 27h ago; expected every 24h');
    expect(items[2].detail).toContain('20m ago');
  });

  it('treats a never-run cron as overdue', () => {
    const pipeline = healthyPipeline({ crons: { dailySyncAt: null, weeklySyncAt: iso(HOUR), enrichmentAt: null, enrichmentHasWork: true } });
    const items = deriveAttention({ pipeline, now: NOW });
    expect(items.map((i) => i.id)).toEqual(['cron-daily', 'cron-enrichment']);
    expect(items[0].detail).toContain('never');
  });

  it('accepts a quiet enrichment cron when nothing is queued', () => {
    const pipeline = healthyPipeline({ crons: { dailySyncAt: iso(HOUR), weeklySyncAt: iso(HOUR), enrichmentAt: null, enrichmentHasWork: false } });
    expect(deriveAttention({ pipeline, now: NOW })).toEqual([]);
  });

  it('orders critical items before warnings regardless of section', () => {
    const items = deriveAttention({
      sources: [source({ name: 'a', status: 'warning', consecutiveEmptyRuns: 2 })],
      pipeline: healthyPipeline({ budget: { date: 'd', used: 200, limit: 200 } }),
      now: NOW,
    });
    expect(items.map((i) => i.severity)).toEqual(['critical', 'warning']);
  });
});
