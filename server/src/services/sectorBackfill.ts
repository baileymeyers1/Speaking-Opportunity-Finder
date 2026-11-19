import { SECTORS, normalizeSectors, type Sector } from '../lib/sectors.js';
import { isKnownTag, sectorsFromTags } from './sectorMapping.js';

/**
 * The plan behind scripts/backfillSectors.ts, kept apart from the database so
 * it can be tested: which stored rows get which sectors from their tags, and
 * what the catalogue looks like afterwards.
 */

export interface BackfillRow {
  id: string;
  /** JSON-encoded free-text tags, as stored. */
  industries: string;
  sectors: string[] | null;
}

export interface SectorCount {
  id: Sector;
  label: string;
  count: number;
}

export interface SectorSummary {
  rows: number;
  withSector: number;
  withTwo: number;
  withoutSector: number;
  /** Every sector, in list order; a row in two sectors counts in both. */
  bySector: SectorCount[];
}

export interface BackfillPlan {
  /** Rows that have no sector and whose tags point to one. Rows that already have a sector are never touched. */
  updates: Array<{ id: string; sectors: Sector[] }>;
  /** Rows left without a sector because they carry no tag at all. */
  untagged: number;
  /** Rows left without a sector although they carry tags. */
  unplaced: number;
  /** Tags of the unplaced rows that the mapping knows no word of, most frequent first. */
  unknownTags: Array<{ tag: string; count: number }>;
  /** Sectors of every row once the updates are applied. */
  after: Map<string, Sector[]>;
}

function parseTags(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

export function planSectorBackfill(rows: readonly BackfillRow[]): BackfillPlan {
  const plan: BackfillPlan = { updates: [], untagged: 0, unplaced: 0, unknownTags: [], after: new Map() };
  const unknown = new Map<string, number>();

  for (const row of rows) {
    const stored = normalizeSectors(row.sectors);
    if (stored.length > 0) {
      plan.after.set(row.id, stored);
      continue;
    }
    const tags = parseTags(row.industries);
    const sectors = sectorsFromTags(tags);
    plan.after.set(row.id, sectors);
    if (sectors.length > 0) {
      plan.updates.push({ id: row.id, sectors });
    } else if (tags.length === 0) {
      plan.untagged++;
    } else {
      plan.unplaced++;
      for (const tag of tags) {
        if (!isKnownTag(tag)) unknown.set(tag, (unknown.get(tag) ?? 0) + 1);
      }
    }
  }

  plan.unknownTags = [...unknown.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return plan;
}

/** Counts over the given rows, using the sectors each has in `after`. */
export function summarizeSectors(ids: readonly string[], after: ReadonlyMap<string, readonly Sector[]>): SectorSummary {
  const counts = new Map<Sector, number>();
  let withSector = 0;
  let withTwo = 0;
  for (const id of ids) {
    const sectors = after.get(id) ?? [];
    if (sectors.length > 0) withSector++;
    if (sectors.length > 1) withTwo++;
    for (const sector of sectors) counts.set(sector, (counts.get(sector) ?? 0) + 1);
  }
  return {
    rows: ids.length,
    withSector,
    withTwo,
    withoutSector: ids.length - withSector,
    bySector: SECTORS.map((sector) => ({ id: sector.id, label: sector.label, count: counts.get(sector.id) ?? 0 })),
  };
}

export function formatSectorSummary(title: string, summary: SectorSummary): string {
  const share = summary.rows === 0 ? '0.0' : ((summary.withSector / summary.rows) * 100).toFixed(1);
  const lines = [
    `${title}: ${summary.rows} rows, ${summary.withSector} with a sector (${share}%), ` +
      `${summary.withTwo} with two, ${summary.withoutSector} without.`,
  ];
  for (const sector of summary.bySector) {
    lines.push(`  ${String(sector.count).padStart(5)}  ${sector.label}`);
  }
  return lines.join('\n');
}
