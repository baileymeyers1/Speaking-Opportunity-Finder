import { Search } from 'lucide-react';
import type { AdminDemandResponse } from '../../types';
import { SectionCard } from './SectionCard';
import { CountList, StatTile } from './StatTile';

export function DemandSection({
  data,
  isPending,
  error,
}: {
  data: AdminDemandResponse | undefined;
  isPending: boolean;
  error: unknown;
}) {
  return (
    <SectionCard
      id="demand"
      title="Demand"
      description="What users ask for: saved searches today, live-search queries once the search log ships."
      icon={Search}
      isPending={isPending}
      error={error}
    >
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Saved searches" value={data.savedSearches.total} note={`by ${data.savedSearches.users} ${data.savedSearches.users === 1 ? 'user' : 'users'}`} />
            <StatTile label="Saved in 7 days" value={data.savedSearches.createdLast7d} />
            <StatTile label="With a text query" value={data.savedSearches.withQuery} />
            <StatTile label="Remote only" value={data.savedSearches.remoteOnly} />
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Saved queries</h3>
              <CountList items={data.savedSearches.topQueries} emptyText="No saved queries yet." />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Saved industries</h3>
              <CountList items={data.savedSearches.topIndustries} emptyText="No industry filters saved." />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Saved locations</h3>
              <CountList items={data.savedSearches.topLocations} emptyText="No location filters saved." />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Saved formats</h3>
              <CountList items={data.savedSearches.topFormats} emptyText="No format filters saved." />
            </div>
          </div>

          <div className="rounded-md border border-dashed p-3">
            <h3 className="text-sm font-semibold text-foreground">Live-search queries</h3>
            {data.searchLog.available ? (
              <div className="mt-2">
                <p className="mb-2 text-xs text-muted-foreground">{data.searchLog.searchesLast7d} searches in 7 days</p>
                <CountList items={data.searchLog.topQueries} emptyText="No live searches logged yet." />
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Not available yet: the search log lands with the next sources release.
              </p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
