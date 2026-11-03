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
      description="What users ask for: saved searches and the last 30 days of live-search queries."
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

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Live-search queries</h3>
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Searches in 7 days" value={data.searchLog.total7d} />
              <StatTile label="Searches in 30 days" value={data.searchLog.total30d} note={`${data.searchLog.distinctQueries30d} distinct queries`} />
            </div>
            <CountList
              items={data.searchLog.topQueries.map((entry) => ({
                label: `${entry.query} (avg ${entry.averageResults} results)`,
                count: entry.count,
              }))}
              emptyText="No live searches logged yet."
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}
