import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Search } from 'lucide-react';
import type { LiveSearchAnalytics } from './types';

export function LiveSearchAnalyticsCard({ analytics }: { analytics: LiveSearchAnalytics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Live Search Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-md bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Total Results</p>
            <p className="text-2xl font-semibold text-foreground">
              {analytics.totalLiveSearchResults}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Last 24h</p>
            <p className="text-2xl font-semibold text-foreground">
              {analytics.last24h}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Last 7d</p>
            <p className="text-2xl font-semibold text-foreground">
              {analytics.last7d}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Last 30d</p>
            <p className="text-2xl font-semibold text-foreground">
              {analytics.last30d}
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Top Industries from Live Searches
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {analytics.topIndustries.map((item) => (
              <div
                key={item.industry}
                className="rounded-md bg-muted/50 p-3 text-center"
              >
                <p className="text-xs text-muted-foreground capitalize">
                  {item.industry}
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {item.count}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
