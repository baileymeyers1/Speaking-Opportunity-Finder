import type { AdminPipelineResponse, AdminSourceHealth } from '../../types';
import { formatAge } from './formatters';

/**
 * What the attention strip shows: the conditions an admin must act on, derived
 * from the sources and pipeline responses. Critical items are red and come
 * first; warnings are amber.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const ATTENTION_THRESHOLDS = {
  /** Consecutive zero-row or error runs before a source is failing (matches the server). */
  failingRuns: 3,
  /** Rows due for re-verification before the backlog is a problem. */
  verificationBacklog: 50,
  /** Share of the daily Claude budget that is worth a warning. */
  budgetWarningShare: 0.9,
  dailySyncMaxAgeMs: 26 * HOUR_MS,
  weeklySyncMaxAgeMs: 8 * DAY_MS,
  enrichmentMaxAgeMs: 15 * MINUTE_MS,
};

export type AttentionSeverity = 'critical' | 'warning';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  /** Section anchor the item links to. */
  section: 'sources' | 'pipeline';
}

export interface AttentionInput {
  sources?: AdminSourceHealth[];
  pipeline?: AdminPipelineResponse;
  now: Date;
}

function runWord(count: number): string {
  return count === 1 ? 'run' : 'runs';
}

function sourceItems(sources: AdminSourceHealth[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const source of sources) {
    if (source.status === 'failing') {
      items.push({
        id: `source-failing-${source.name}`,
        severity: 'critical',
        title: `${source.name} is failing`,
        detail: `${source.consecutiveEmptyRuns} ${runWord(source.consecutiveEmptyRuns)} in a row with errors or no rows${
          source.lastRun?.error ? `: ${source.lastRun.error}` : ''
        }`,
        section: 'sources',
      });
    } else if (source.status === 'warning') {
      items.push({
        id: `source-warning-${source.name}`,
        severity: 'warning',
        title: `${source.name} returned nothing`,
        detail: `${source.consecutiveEmptyRuns} ${runWord(source.consecutiveEmptyRuns)} with errors or no rows; failing after ${ATTENTION_THRESHOLDS.failingRuns}`,
        section: 'sources',
      });
    }
  }
  return items;
}

function ageOrNever(iso: string | null, now: Date): string {
  return iso ? `${formatAge(now.getTime() - new Date(iso).getTime())} ago` : 'never';
}

function cronItems(pipeline: AdminPipelineResponse, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { crons } = pipeline;
  const olderThan = (iso: string | null, maxAgeMs: number) =>
    !iso || now.getTime() - new Date(iso).getTime() > maxAgeMs;

  if (olderThan(crons.dailySyncAt, ATTENTION_THRESHOLDS.dailySyncMaxAgeMs)) {
    items.push({
      id: 'cron-daily',
      severity: 'critical',
      title: 'Daily sync has not run',
      detail: `Last daily scraper run ${ageOrNever(crons.dailySyncAt, now)}; expected every 24h`,
      section: 'pipeline',
    });
  }
  if (olderThan(crons.weeklySyncAt, ATTENTION_THRESHOLDS.weeklySyncMaxAgeMs)) {
    items.push({
      id: 'cron-weekly',
      severity: 'critical',
      title: 'Weekly sync has not run',
      detail: `Last weekly scraper run ${ageOrNever(crons.weeklySyncAt, now)}; expected every 7 days`,
      section: 'pipeline',
    });
  }
  // Silence is only a problem when there is work to do: an empty queue leaves no timestamps behind.
  if (crons.enrichmentHasWork && olderThan(crons.enrichmentAt, ATTENTION_THRESHOLDS.enrichmentMaxAgeMs)) {
    items.push({
      id: 'cron-enrichment',
      severity: 'critical',
      title: 'Enrichment cron is not running',
      detail: `Work is queued but the last enrichment or verification was ${ageOrNever(crons.enrichmentAt, now)}; expected every 5 min`,
      section: 'pipeline',
    });
  }
  return items;
}

function pipelineItems(pipeline: AdminPipelineResponse, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { budget, enrichment, verification } = pipeline;

  if (budget.used >= budget.limit) {
    items.push({
      id: 'budget-exhausted',
      severity: 'critical',
      title: 'Claude budget exhausted',
      detail: `${budget.used} of ${budget.limit} calls used today (UTC); enrichment and verification pause until tomorrow`,
      section: 'pipeline',
    });
  } else if (budget.used >= budget.limit * ATTENTION_THRESHOLDS.budgetWarningShare) {
    items.push({
      id: 'budget-low',
      severity: 'warning',
      title: 'Claude budget nearly used',
      detail: `${budget.used} of ${budget.limit} calls used today (UTC)`,
      section: 'pipeline',
    });
  }

  if (enrichment.staleClaims > 0) {
    items.push({
      id: 'stale-claims',
      severity: 'critical',
      title: `${enrichment.staleClaims} stale enrichment ${enrichment.staleClaims === 1 ? 'claim' : 'claims'}`,
      detail: 'A worker held these rows past the claim window; the next batch retries them, repeated stalls mean a crashing worker',
      section: 'pipeline',
    });
  }

  if (verification.due > ATTENTION_THRESHOLDS.verificationBacklog) {
    items.push({
      id: 'verification-backlog',
      severity: 'critical',
      title: `${verification.due} rows overdue for verification`,
      detail: `${verification.dueDeadlineSoon} with a deadline inside 14 days; threshold ${ATTENTION_THRESHOLDS.verificationBacklog}`,
      section: 'pipeline',
    });
  }

  return [...items, ...cronItems(pipeline, now)];
}

/** Critical first, then warnings, each in the order they were found. */
export function deriveAttention({ sources, pipeline, now }: AttentionInput): AttentionItem[] {
  const items = [...(sources ? sourceItems(sources) : []), ...(pipeline ? pipelineItems(pipeline, now) : [])];
  const rank = (item: AttentionItem) => (item.severity === 'critical' ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b));
}
