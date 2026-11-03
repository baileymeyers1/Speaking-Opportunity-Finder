import { useState } from 'react';
import { Play, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { AdminSourceHealth, AdminSourcesResponse } from '../../types';
import { useRunScraper } from '../../hooks/useAdminActions';
import { ActionResult, errorMessage, type ActionState } from './ActionResult';
import { formatCount, formatDuration, formatRelative, percentOf } from './formatters';
import { SectionCard } from './SectionCard';
import { Sparkline } from './Sparkline';
import { RunStatusBadge, SourceStatusBadge } from './StatusBadge';

function LastRunCell({ source, now }: { source: AdminSourceHealth; now: Date }) {
  const run = source.lastRun;
  if (!run) return <span className="text-muted-foreground">never</span>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <RunStatusBadge status={run.status} found={run.found} />
        <time dateTime={run.startedAt} className="text-muted-foreground">
          {formatRelative(run.startedAt, now)}
        </time>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {formatCount(run.found)} found, {formatCount(run.added)} added, {formatCount(run.updated)} updated in{' '}
        {formatDuration(run.durationMs)}
      </p>
      {run.error && (
        <p className="max-w-xs truncate text-xs text-destructive" title={run.error}>
          {run.error}
        </p>
      )}
    </div>
  );
}

function RowsCell({ rows }: { rows: AdminSourceHealth['rows'] }) {
  return (
    <div className="space-y-0.5 tabular-nums">
      <p className="font-medium text-foreground">{formatCount(rows.active)} active</p>
      <p className="text-xs text-muted-foreground">
        {percentOf(rows.enriched, rows.total)}% enriched, {percentOf(rows.verified, rows.total)}% verified,{' '}
        {formatCount(rows.closed)} closed, {formatCount(rows.total)} total
      </p>
    </div>
  );
}

export function SourcesSection({
  data,
  isPending,
  error,
  now,
}: {
  data: AdminSourcesResponse | undefined;
  isPending: boolean;
  error: unknown;
  now: Date;
}) {
  const runScraper = useRunScraper();
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });
  const [runningName, setRunningName] = useState<string | null>(null);

  const run = (source: AdminSourceHealth) => {
    if (!source.cadence) return;
    setRunningName(source.name);
    setAction({ kind: 'running', message: `Running ${source.name}…` });
    runScraper.mutate(
      { name: source.name, cadence: source.cadence },
      {
        onSuccess: (result) => {
          const summary = result.runs.find((r) => r.scraper === source.name);
          setAction({
            kind: summary?.status === 'error' ? 'failed' : 'done',
            message: summary
              ? summary.status === 'error'
                ? `${source.name} failed: ${summary.error ?? 'unknown error'}`
                : `${source.name}: ${summary.found} found, ${summary.added} added, ${summary.updated} updated in ${formatDuration(summary.durationMs)}`
              : `${source.name} was skipped: ${result.skipped.join(', ') || 'not run'}`,
          });
        },
        onError: (err) => setAction({ kind: 'failed', message: `${source.name} failed: ${errorMessage(err)}` }),
        onSettled: () => setRunningName(null),
      }
    );
  };

  return (
    <SectionCard
      id="sources"
      title="Sources"
      description="Every registered scraper, judged on its run history. Three empty or failed runs in a row is failing."
      icon={Radar}
      isPending={isPending}
      error={error}
    >
      {data && (
        <div className="space-y-3">
          <Table>
            <TableCaption className="sr-only">Scraper health: status, last run, 14-day trend and stored rows per source</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>14-day trend</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sources.map((source) => (
                <TableRow
                  key={source.name}
                  className={cn(source.status === 'failing' && 'bg-red-50/60 dark:bg-red-950/20')}
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{source.name}</p>
                    <p className="text-xs text-muted-foreground">{source.cadence ?? 'not scheduled'}</p>
                  </TableCell>
                  <TableCell>
                    <SourceStatusBadge status={source.status} />
                    {source.consecutiveEmptyRuns > 0 && source.registered && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {source.consecutiveEmptyRuns} empty {source.consecutiveEmptyRuns === 1 ? 'run' : 'runs'} in a row
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <LastRunCell source={source} now={now} />
                  </TableCell>
                  <TableCell>
                    <Sparkline points={source.sparkline} label={source.name} />
                  </TableCell>
                  <TableCell>
                    <RowsCell rows={source.rows} />
                  </TableCell>
                  <TableCell className="text-right">
                    {source.cadence && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => run(source)}
                        disabled={runScraper.isPending}
                        aria-label={`Run ${source.name} now`}
                      >
                        <Play aria-hidden="true" />
                        {runningName === source.name ? 'Running…' : 'Run now'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ActionResult state={action} />
        </div>
      )}
    </SectionCard>
  );
}
