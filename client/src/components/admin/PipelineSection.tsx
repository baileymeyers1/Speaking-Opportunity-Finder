import { useState } from 'react';
import { Play, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdminPipelineResponse } from '../../types';
import { useRunEnrichmentBatch } from '../../hooks/useAdminActions';
import { ActionResult, errorMessage, type ActionState } from './ActionResult';
import { ATTENTION_THRESHOLDS } from './attention';
import { formatCount, formatDuration, formatRelative } from './formatters';
import { PipelineEvents } from './PipelineEvents';
import { SectionCard } from './SectionCard';
import { StatTile } from './StatTile';

/** Daily Claude budget as a meter: the fill colour follows how much is left. */
function BudgetMeter({ used, limit, date }: { used: number; limit: number; date: string }) {
  const share = limit > 0 ? Math.min(1, used / limit) : 0;
  const tone = share >= 1 ? 'critical' : share >= ATTENTION_THRESHOLDS.budgetWarningShare ? 'warning' : 'good';
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Claude budget today (UTC {date})</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatCount(used)} / {formatCount(limit)}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Claude calls used today"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-valuetext={`${used} of ${limit} calls used`}
        className={cn(
          'mt-2 h-2 w-full overflow-hidden rounded-full',
          tone === 'critical' ? 'bg-red-200 dark:bg-red-900' : tone === 'warning' ? 'bg-amber-200 dark:bg-amber-900' : 'bg-emerald-200 dark:bg-emerald-900'
        )}
      >
        <div
          className={cn(
            'h-full rounded-full',
            tone === 'critical' ? 'bg-red-600' : tone === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'
          )}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {share >= 1 ? 'Exhausted: enrichment and verification pause until tomorrow.' : `${formatCount(limit - used)} calls left; shared by enrichment and verification.`}
      </p>
    </div>
  );
}

function CronRow({ label, at, expected, now, overdue }: { label: string; at: string | null; expected: string; now: Date; overdue: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-foreground">{label}</span>
      <span className={cn('tabular-nums', overdue ? 'font-medium text-red-700 dark:text-red-300' : 'text-muted-foreground')}>
        {at ? <time dateTime={at}>{formatRelative(at, now)}</time> : 'never'}
        <span className="text-xs text-muted-foreground"> · {expected}</span>
        {overdue && <span className="sr-only"> (overdue)</span>}
      </span>
    </li>
  );
}

export function PipelineSection({
  data,
  isPending,
  error,
  now,
}: {
  data: AdminPipelineResponse | undefined;
  isPending: boolean;
  error: unknown;
  now: Date;
}) {
  const runBatch = useRunEnrichmentBatch();
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });

  const run = () => {
    setAction({ kind: 'running', message: 'Running an enrichment batch (up to 5 rows, 25s)…' });
    runBatch.mutate(undefined, {
      onSuccess: (r) =>
        setAction({
          kind: 'done',
          message: `Batch done in ${formatDuration(r.durationMs)}: ${r.enriched} enriched, ${r.skipped} skipped, ${r.retried} to retry, ${r.failed} failed, ${r.verified} verified, ${r.verifyFailed} verification errors.`,
        }),
      onError: (err) => setAction({ kind: 'failed', message: `Batch failed: ${errorMessage(err)}` }),
    });
  };

  const olderThan = (iso: string | null, maxAgeMs: number) => !iso || now.getTime() - new Date(iso).getTime() > maxAgeMs;

  return (
    <SectionCard
      id="pipeline"
      title="Pipeline"
      description="Enrichment and verification queues, today's Claude budget, and whether the scheduled jobs are alive."
      icon={Workflow}
      isPending={isPending}
      error={error}
      actions={
        <Button type="button" size="sm" onClick={run} disabled={runBatch.isPending}>
          <Play aria-hidden="true" />
          {runBatch.isPending ? 'Running…' : 'Run enrichment batch now'}
        </Button>
      }
    >
      {data && (
        <div className="space-y-5">
          <ActionResult state={action} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Unenriched backlog" value={data.enrichment.backlog} note={`${formatCount(data.enrichment.enrichedLast24h)} enriched in 24h`} />
            <StatTile
              label="Claimed by a worker"
              value={data.enrichment.claimed}
              tone={data.enrichment.staleClaims > 0 ? 'critical' : 'neutral'}
              note={data.enrichment.staleClaims > 0 ? `${formatCount(data.enrichment.staleClaims)} stale` : 'no stale claims'}
            />
            <StatTile label="Failed after 3 attempts" value={data.enrichment.failed} tone={data.enrichment.failed > 0 ? 'warning' : 'neutral'} />
            <StatTile
              label="Due for verification"
              value={data.verification.due}
              tone={data.verification.due > ATTENTION_THRESHOLDS.verificationBacklog ? 'critical' : 'neutral'}
              note={`${formatCount(data.verification.dueDeadlineSoon)} with a deadline inside 14 days`}
            />
            <StatTile label="Verification errors" value={data.verification.withError} tone={data.verification.withError > 0 ? 'warning' : 'neutral'} note="visible rows whose last check failed" />
            <StatTile label="Low-confidence dates" value={data.verification.lowConfidenceDates} note="shown as approximate on cards" />
            <StatTile label="Verified in 24h" value={data.verification.verifiedLast24h} note={`last ${formatRelative(data.verification.lastVerifiedAt, now)}`} />
            <StatTile label="Enriched in 24h" value={data.enrichment.enrichedLast24h} note={`last ${formatRelative(data.enrichment.lastEnrichedAt, now)}`} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <BudgetMeter used={data.budget.used} limit={data.budget.limit} date={data.budget.date} />
            <div className="rounded-md border bg-muted/30 p-3">
              <h3 className="text-xs font-medium text-muted-foreground">Scheduled jobs</h3>
              <ul className="mt-1 divide-y">
                <CronRow label="Daily sync" at={data.crons.dailySyncAt} expected="every 24h" now={now} overdue={olderThan(data.crons.dailySyncAt, ATTENTION_THRESHOLDS.dailySyncMaxAgeMs)} />
                <CronRow label="Weekly sync" at={data.crons.weeklySyncAt} expected="every 7d" now={now} overdue={olderThan(data.crons.weeklySyncAt, ATTENTION_THRESHOLDS.weeklySyncMaxAgeMs)} />
                <CronRow
                  label="Enrichment"
                  at={data.crons.enrichmentAt}
                  expected={data.crons.enrichmentHasWork ? 'every 5m' : 'every 5m, queue empty'}
                  now={now}
                  overdue={data.crons.enrichmentHasWork && olderThan(data.crons.enrichmentAt, ATTENTION_THRESHOLDS.enrichmentMaxAgeMs)}
                />
              </ul>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Recent events</h3>
            <PipelineEvents events={data.events} now={now} />
          </div>
        </div>
      )}
    </SectionCard>
  );
}
