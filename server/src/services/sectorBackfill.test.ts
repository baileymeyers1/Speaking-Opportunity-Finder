import { describe, it, expect } from 'vitest';
import { formatSectorSummary, planSectorBackfill, summarizeSectors, type BackfillRow } from './sectorBackfill.js';

const row = (id: string, tags: string[], sectors: string[] | null = null): BackfillRow => ({
  id,
  industries: JSON.stringify(tags),
  sectors,
});

describe('planSectorBackfill', () => {
  const rows = [
    row('scraped', ['devops', 'kubernetes']),
    row('empty-list', ['nursing'], []),
    row('claude', ['ai'], ['healthcare']),
    row('untagged', []),
    row('unplaced', ['julialang', 'workshop', 'community']),
    { id: 'broken', industries: 'not json', sectors: null },
  ];
  const plan = planSectorBackfill(rows);

  it('gives rows without a sector the sectors their tags point to', () => {
    expect(plan.updates).toEqual([
      { id: 'scraped', sectors: ['cloud-devops'] },
      { id: 'empty-list', sectors: ['healthcare'] },
    ]);
  });

  it('never touches a row that already has a sector', () => {
    expect(plan.updates.map((update) => update.id)).not.toContain('claude');
    expect(plan.after.get('claude')).toEqual(['healthcare']);
  });

  it('counts the rows it leaves without a sector, and why', () => {
    expect(plan.untagged).toBe(2);
    expect(plan.unplaced).toBe(1);
    expect(plan.after.get('untagged')).toEqual([]);
  });

  it('lists the tags it knows no word of, not the ones that are merely broad', () => {
    expect(plan.unknownTags).toEqual([
      { tag: 'julialang', count: 1 },
      { tag: 'workshop', count: 1 },
    ]);
  });

  it('plans nothing on a second run', () => {
    const second = planSectorBackfill(rows.map((item) => ({ ...item, sectors: plan.after.get(item.id) ?? [] })));
    expect(second.updates).toEqual([]);
  });
});

describe('summarizeSectors', () => {
  const plan = planSectorBackfill([
    row('a', ['ai', 'healthcare']),
    row('b', ['ai']),
    row('c', []),
    row('hidden', ['finance']),
  ]);

  it('counts a row with two sectors in both, over the rows asked for', () => {
    const summary = summarizeSectors(['a', 'b', 'c'], plan.after);
    expect(summary).toMatchObject({ rows: 3, withSector: 2, withTwo: 1, withoutSector: 1 });
    const count = (id: string) => summary.bySector.find((sector) => sector.id === id)?.count;
    expect(count('ai')).toBe(2);
    expect(count('healthcare')).toBe(1);
    expect(count('finance')).toBe(0);
    expect(summary.bySector).toHaveLength(34);
  });

  it('prints one line per sector under a headline', () => {
    const text = formatSectorSummary('Listed rows', summarizeSectors(['a', 'b', 'c'], plan.after));
    expect(text.split('\n')[0]).toBe('Listed rows: 3 rows, 2 with a sector (66.7%), 1 with two, 1 without.');
    expect(text).toContain('    2  AI & Machine Learning');
    expect(text.split('\n')).toHaveLength(35);
  });
});
