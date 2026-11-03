import { Library } from 'lucide-react';
import type { AdminCatalogueResponse } from '../../types';
import { formatCount, percentOf } from './formatters';
import { SectionCard } from './SectionCard';
import { CountList, StatTile } from './StatTile';

export function CatalogueSection({
  data,
  isPending,
  error,
}: {
  data: AdminCatalogueResponse | undefined;
  isPending: boolean;
  error: unknown;
}) {
  const deadlineBuckets = data
    ? [
        { label: 'Closing within 7 days', count: data.byDeadline.within7Days },
        { label: '7 to 30 days', count: data.byDeadline.within30Days },
        { label: '30 to 90 days', count: data.byDeadline.within90Days },
        { label: 'Later than 90 days', count: data.byDeadline.later },
        { label: 'No deadline', count: data.byDeadline.noDeadline },
      ]
    : [];

  return (
    <SectionCard
      id="catalogue"
      title="Catalogue"
      description="What a visitor can browse right now: open, relevant rows with a future or unknown deadline."
      icon={Library}
      isPending={isPending}
      error={error}
    >
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Active" value={data.totals.active} note={`of ${formatCount(data.totals.all)} stored`} />
            <StatTile label="Closed this week" value={data.closedThisWeek} note={`${formatCount(data.totals.closed)} closed in all`} />
            <StatTile label="Expired, still stored" value={data.totals.expired} note="removed by the next sync unless saved" />
            <StatTile label="Not relevant" value={data.totals.irrelevant} note="hidden by enrichment" />
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">By deadline</h3>
              <CountList items={deadlineBuckets} emptyText="No active rows." />
              <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">By location</h3>
              <CountList
                items={[
                  { label: 'Remote', count: data.remote },
                  { label: 'In person', count: data.inPerson },
                ]}
                emptyText="No active rows."
              />
              <p className="mt-1 text-xs text-muted-foreground">{percentOf(data.remote, data.totals.active)}% remote</p>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">By format</h3>
              <CountList items={data.byFormat} emptyText="No active rows." />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Top industries</h3>
              <CountList items={data.byIndustry} emptyText="No industries tagged." />
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
