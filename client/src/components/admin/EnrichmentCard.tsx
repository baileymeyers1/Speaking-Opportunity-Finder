import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Cpu, CheckCircle2, MinusCircle, XCircle, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EnrichmentStats } from './types';

export function EnrichmentCard({ stats }: { stats: EnrichmentStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-5 w-5" />
          Enrichment Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-md bg-primary/5 border border-primary/10 p-4">
            <p className="text-sm text-muted-foreground mb-1">
              Records Enriched
            </p>
            <p className="text-2xl font-semibold text-primary">
              {stats.enrichedCount.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.enrichmentPercentage.toFixed(1)}% of
              total
            </p>
          </div>

          <div className="rounded-md bg-emerald-500/5 border border-emerald-500/10 p-4">
            <p className="text-sm text-muted-foreground mb-1">
              Last 24 Hours
            </p>
            <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {stats.recentEnrichments.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Recently enriched
            </p>
          </div>

          <div className="rounded-md bg-amber-500/5 border border-amber-500/10 p-4">
            <p className="text-sm text-muted-foreground mb-1">Skipped</p>
            <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
              {stats.skippedCount.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {(
                (stats.skippedCount /
                  stats.totalOpportunities) *
                100
              ).toFixed(1)}
              % of total
            </p>
          </div>

          <div className="rounded-md bg-destructive/5 border border-destructive/10 p-4">
            <p className="text-sm text-muted-foreground mb-1">
              Failed/Missing
            </p>
            <p className="text-2xl font-semibold text-destructive">
              {(
                stats.failedCount +
                stats.unenrichedCount
              ).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.failedCount} failed,{' '}
              {stats.unenrichedCount} unenriched
            </p>
          </div>
        </div>

        <Separator />

        {/* Enrichment by Source Table */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Enrichment by Source
          </h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                    Source
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Total
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Enriched
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Skipped
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Failed
                  </th>
                  <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                    Success Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.bySource.map((source) => (
                  <tr
                    key={source.source}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-medium text-foreground">
                      {source.source}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {source.total.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span className="text-primary font-semibold">
                        {source.enriched.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-amber-600 dark:text-amber-400">
                      {source.skipped.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right text-destructive">
                      {source.failed.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span
                        className={cn(
                          'font-semibold',
                          source.enrichmentRate >= 80 &&
                            'text-emerald-600 dark:text-emerald-400',
                          source.enrichmentRate >= 50 &&
                            source.enrichmentRate < 80 &&
                            'text-amber-600 dark:text-amber-400',
                          source.enrichmentRate < 50 && 'text-destructive'
                        )}
                      >
                        {source.enrichmentRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Status legend */}
        <div className="rounded-md bg-muted/50 p-4 text-xs text-muted-foreground space-y-1.5">
          <p className="font-semibold text-foreground mb-2">
            Status Definitions:
          </p>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span>
              <span className="font-semibold text-primary">Enriched:</span>{' '}
              Successfully enriched with Claude API
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SkipForward className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Skipped:
              </span>{' '}
              Already had complete data from scraper
            </span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            <span>
              <span className="font-semibold text-destructive">Failed:</span>{' '}
              Enrichment attempted but failed
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              <span className="font-semibold">Unenriched:</span> Never
              attempted enrichment
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
