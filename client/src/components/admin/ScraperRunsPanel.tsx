import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScraperRun {
  id: string;
  scraper: string;
  cadence: string;
  status: 'running' | 'ok' | 'error' | string;
  startedAt: string;
  finishedAt: string | null;
  found: number;
  added: number;
  updated: number;
  error: string | null;
}

interface ScraperRunsResponse {
  recent: ScraperRun[];
  latestByScraper: ScraperRun[];
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function durationSeconds(run: ScraperRun): string {
  if (!run.finishedAt) return '…';
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ run }: { run: ScraperRun }) {
  if (run.status === 'error') {
    return <Badge variant="destructive">error</Badge>;
  }
  if (run.status === 'running') {
    return <Badge variant="secondary">running</Badge>;
  }
  // A successful run that found nothing is the signal a source has died.
  if (run.found === 0) {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
        ok, 0 rows
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-400">
      ok
    </Badge>
  );
}

/**
 * Latest run per scraper plus a short history. Reads `ScraperRun` rows that
 * the sync records, so a source that stops producing data is visible here
 * the next day rather than months later.
 */
export function ScraperRunsPanel() {
  const [data, setData] = useState<ScraperRunsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ScraperRunsResponse>('/admin/analytics/scraper-runs')
      .then((response) => {
        if (!cancelled) setData(response.data ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load scraper runs');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" aria-hidden="true" />
          Scraper Runs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {!data && !error && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        )}

        {data && data.latestByScraper.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No runs recorded yet. Runs appear after the next scheduled or manual sync.
          </p>
        )}

        {data && data.latestByScraper.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Latest run per scraper</caption>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">Scraper</th>
                  <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">Cadence</th>
                  <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">Status</th>
                  <th scope="col" className="text-right py-2.5 px-4 font-medium text-muted-foreground">Found</th>
                  <th scope="col" className="text-right py-2.5 px-4 font-medium text-muted-foreground">Added</th>
                  <th scope="col" className="text-right py-2.5 px-4 font-medium text-muted-foreground">Updated</th>
                  <th scope="col" className="text-right py-2.5 px-4 font-medium text-muted-foreground">Took</th>
                  <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">Last run</th>
                </tr>
              </thead>
              <tbody>
                {data.latestByScraper.map((run) => (
                  <tr key={run.id} className={cn('border-b last:border-0', run.status === 'error' && 'bg-destructive/5')}>
                    <td className="py-2.5 px-4 font-medium">{run.scraper}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{run.cadence}</td>
                    <td className="py-2.5 px-4">
                      <StatusBadge run={run} />
                      {run.error && (
                        <p className="mt-1 text-xs text-muted-foreground max-w-xs truncate" title={run.error}>
                          {run.error}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{run.found}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{run.added}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{run.updated}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{durationSeconds(run)}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">
                      <time dateTime={run.startedAt}>{formatRelative(run.startedAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.recent.length > data.latestByScraper.length && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Recent history ({data.recent.length} runs)
            </summary>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {data.recent.map((run) => (
                <li key={run.id} className="flex flex-wrap gap-x-3">
                  <time dateTime={run.startedAt} className="tabular-nums">
                    {new Date(run.startedAt).toLocaleString()}
                  </time>
                  <span className="font-medium text-foreground">{run.scraper}</span>
                  <span>{run.status}</span>
                  <span className="tabular-nums">
                    {run.found} found, {run.added} added, {run.updated} updated
                  </span>
                  {run.error && <span className="text-destructive truncate max-w-full">{run.error}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
