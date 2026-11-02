import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BarChart3 } from 'lucide-react';
import type { DatabaseStats } from './types';

export function DatabaseStatsCard({ stats }: { stats: DatabaseStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Database Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Added Last 24h</p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.last24hAdded}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Added Last 7d</p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.last7dAdded}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Added Last 30d</p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.last30dAdded}
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Format Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(stats.formatBreakdown).map(
              ([format, count]) => (
                <div
                  key={format}
                  className="rounded-md bg-muted/50 p-3 text-center"
                >
                  <p className="text-xs text-muted-foreground capitalize">
                    {format}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {count}
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Top Industries
            </h3>
            <div className="space-y-2">
              {stats.topIndustries
                .slice(0, 5)
                .map((item) => (
                  <div
                    key={item.industry}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="capitalize text-muted-foreground">
                      {item.industry}
                    </span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Top Locations
            </h3>
            <div className="space-y-2">
              {stats.topLocations
                .slice(0, 5)
                .map((item) => (
                  <div
                    key={item.location}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {item.location}
                    </span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
