import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SourceQuality } from './types';

export function SourceQualityCard({ sources }: { sources: SourceQuality[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Source Quality Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
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
                  Last 30d
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  Avg Quality
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  Has Deadline
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  Has Location
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  Has Comp
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  Completeness
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr
                  key={source.source}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-2.5 px-4 font-medium text-foreground">
                    {source.source}
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {source.totalCount}
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {source.last30dCount}
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {source.averageQualityScore}
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {source.hasDeadlinePercentage}%
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {source.hasLocationPercentage}%
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {source.hasCompensationPercentage}%
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <span
                      className={cn(
                        'font-semibold',
                        source.dataCompletenessScore >= 70 &&
                          'text-emerald-600 dark:text-emerald-400',
                        source.dataCompletenessScore >= 40 &&
                          source.dataCompletenessScore < 70 &&
                          'text-amber-600 dark:text-amber-400',
                        source.dataCompletenessScore < 40 &&
                          'text-destructive'
                      )}
                    >
                      {source.dataCompletenessScore}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
