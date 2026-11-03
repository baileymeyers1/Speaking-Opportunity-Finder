import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../../scrapers/index.js', () => ({ SCRAPERS: [] }));

import {
  countConsecutiveEmptyRuns,
  emptyRowCounts,
  sourceStatus,
  summarizeSources,
  toAdminRun,
  type ScraperRunRow,
} from './sources.js';

const NOW = new Date('2026-11-03T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let runId = 0;
function run(scraper: string, daysBack: number, overrides: Partial<ScraperRunRow> = {}): ScraperRunRow {
  const startedAt = new Date(NOW.getTime() - daysBack * DAY);
  return {
    id: `run-${++runId}`,
    scraper,
    cadence: 'daily',
    status: 'ok',
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 4000),
    found: 12,
    added: 2,
    updated: 10,
    error: null,
    ...overrides,
  };
}

describe('countConsecutiveEmptyRuns', () => {
  it('counts zero-row and error runs until the last productive run', () => {
    const runs = [
      run('a', 0, { found: 0 }),
      run('a', 1, { status: 'error', error: 'boom' }),
      run('a', 2, { found: 0 }),
      run('a', 3, { found: 9 }),
      run('a', 4, { found: 0 }),
    ];
    expect(countConsecutiveEmptyRuns(runs)).toBe(3);
  });

  it('ignores a run still in progress', () => {
    expect(countConsecutiveEmptyRuns([run('a', 0, { status: 'running', found: 0, finishedAt: null }), run('a', 1)])).toBe(0);
  });

  it('is zero with no runs or a productive latest run', () => {
    expect(countConsecutiveEmptyRuns([])).toBe(0);
    expect(countConsecutiveEmptyRuns([run('a', 0), run('a', 1, { found: 0 })])).toBe(0);
  });
});

describe('sourceStatus', () => {
  const lastRun = run('a', 0);
  it('maps consecutive empty runs to warning and failing', () => {
    expect(sourceStatus({ registered: true, manual: false, lastRun, consecutiveEmptyRuns: 0 })).toBe('healthy');
    expect(sourceStatus({ registered: true, manual: false, lastRun, consecutiveEmptyRuns: 1 })).toBe('warning');
    expect(sourceStatus({ registered: true, manual: false, lastRun, consecutiveEmptyRuns: 2 })).toBe('warning');
    expect(sourceStatus({ registered: true, manual: false, lastRun, consecutiveEmptyRuns: 3 })).toBe('failing');
  });

  it('distinguishes never-run, retired and manual sources', () => {
    expect(sourceStatus({ registered: true, manual: false, lastRun: null, consecutiveEmptyRuns: 0 })).toBe('never-run');
    expect(sourceStatus({ registered: false, manual: false, lastRun, consecutiveEmptyRuns: 5 })).toBe('retired');
    expect(sourceStatus({ registered: false, manual: true, lastRun: null, consecutiveEmptyRuns: 0 })).toBe('manual');
  });
});

describe('toAdminRun', () => {
  it('serializes dates and computes the duration', () => {
    const admin = toAdminRun(run('confs.tech', 1, { status: 'ok' }));
    expect(admin.startedAt).toBe('2026-11-02T12:00:00.000Z');
    expect(admin.finishedAt).toBe('2026-11-02T12:00:04.000Z');
    expect(admin.durationMs).toBe(4000);
  });

  it('leaves the duration open for a running run', () => {
    expect(toAdminRun(run('x', 0, { status: 'running', finishedAt: null })).durationMs).toBeNull();
  });
});

describe('summarizeSources', () => {
  const registry = [
    { name: 'confs.tech', cadence: 'daily' as const },
    { name: 'linkup', cadence: 'daily' as const },
    { name: 'wikicfp.com', cadence: 'weekly' as const },
  ];

  it('lists registry sources first, then retired ones, with run health and row counts', () => {
    const rowCounts = new Map([
      ['confs.tech', { total: 20, active: 14, enriched: 3, verified: 2, closed: 1 }],
      ['Linkup Search', { total: 17, active: 17, enriched: 0, verified: 0, closed: 0 }],
      ['papercall.io', { total: 5, active: 0, enriched: 0, verified: 0, closed: 5 }],
    ]);
    const runs = [
      run('confs.tech', 0, { found: 19 }),
      run('confs.tech', 1, { found: 0 }),
      run('papercall.io', 0, { found: 0 }),
      run('papercall.io', 1, { found: 0 }),
      run('papercall.io', 2, { found: 0 }),
      run('wikicfp.com', 20, { cadence: 'weekly', found: 95 }),
    ];
    const sources = summarizeSources({ registry, runs, rowCounts, now: NOW });

    expect(sources.map((s) => s.name)).toEqual(['confs.tech', 'linkup', 'wikicfp.com', 'papercall.io']);

    const confs = sources[0];
    expect(confs.status).toBe('healthy');
    expect(confs.cadence).toBe('daily');
    expect(confs.rows).toEqual({ total: 20, active: 14, enriched: 3, verified: 2, closed: 1 });
    expect(confs.lastRun?.found).toBe(19);
    expect(confs.sparkline.map((p) => p.found)).toEqual([0, 19]);

    const linkup = sources[1];
    expect(linkup.status).toBe('never-run');
    expect(linkup.rows.total).toBe(17);

    const wikicfp = sources[2];
    expect(wikicfp.status).toBe('healthy');
    expect(wikicfp.lastRun?.found).toBe(95);
    expect(wikicfp.sparkline).toEqual([]);

    const papercall = sources[3];
    expect(papercall.registered).toBe(false);
    expect(papercall.status).toBe('retired');
    expect(papercall.consecutiveEmptyRuns).toBe(3);
    expect(papercall.rows.closed).toBe(5);
  });

  it('flags a registered source as failing after three empty runs', () => {
    const runs = [run('confs.tech', 0, { found: 0 }), run('confs.tech', 1, { status: 'error' }), run('confs.tech', 2, { found: 0 })];
    const [confs] = summarizeSources({ registry: registry.slice(0, 1), runs, rowCounts: new Map(), now: NOW });
    expect(confs.status).toBe('failing');
    expect(confs.consecutiveEmptyRuns).toBe(3);
    expect(confs.rows).toEqual(emptyRowCounts());
  });

  it('keeps sparkline points in chronological order and drops running runs', () => {
    const runs = [
      run('confs.tech', 0, { status: 'running', finishedAt: null, found: 0 }),
      run('confs.tech', 3, { found: 5 }),
      run('confs.tech', 1, { found: 7 }),
    ];
    const [confs] = summarizeSources({ registry: registry.slice(0, 1), runs, rowCounts: new Map(), now: NOW });
    expect(confs.sparkline.map((p) => p.found)).toEqual([5, 7]);
    expect(confs.status).toBe('healthy');
  });
});
