import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { StatusDot } from './StatCard';
import type { ScraperHealth } from './types';

export function ScraperHealthCard({ scrapers }: { scrapers: ScraperHealth[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Scraper Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                  Scraper
                </th>
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  Total
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  24h
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  7d
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  30d
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
                  Avg Quality
                </th>
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                  Last Run
                </th>
              </tr>
            </thead>
            <tbody>
              {scrapers.map((scraper) => (
                <tr
                  key={scraper.name}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-2.5 px-4 font-medium text-foreground">
                    {scraper.name}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <StatusDot status={scraper.status} />
                      <span className="capitalize text-muted-foreground">
                        {scraper.status}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-foreground">
                    {scraper.totalOpportunities}
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {scraper.last24h}
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {scraper.last7d}
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {scraper.last30d}
                  </td>
                  <td className="py-2.5 px-4 text-right text-muted-foreground">
                    {scraper.averageQualityScore}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-muted-foreground">
                    {scraper.lastRun
                      ? new Date(scraper.lastRun).toLocaleString()
                      : 'Never'}
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
