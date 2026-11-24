import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Lane, LaneSummary, Opportunity } from '../../types';
import { LANES } from '../../filters/constants';
import { CALL_ROW_GRID, CallRow } from './CallRow';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CallListProps {
  opportunities: Opportunity[];
  isLoading: boolean;
  lane: Lane;
  /** Calls in each lane under the filters in force; used to point at a lane that has rows when this one is empty. */
  counts: LaneSummary['counts'] | undefined;
  /** Active location filter; when set, the rows in the place come first, then online ones, then any elsewhere. */
  locations?: string[];
  /** True when a search term or any filter is narrowing the list. */
  isFiltered: boolean;
  onLaneChange: (lane: Lane) => void;
  onClearFilters: () => void;
  page: number;
  totalPages: number;
  showPagination: boolean;
  onPageChange: (page: number) => void;
}

const LANE_HEADINGS: Record<Lane, string> = {
  closing: 'Calls with a deadline',
  open: 'Calls that are always open',
  watch: 'Events to watch',
};

const NOTHING_HERE: Record<Lane, string> = {
  closing: 'No call with a deadline matches.',
  open: 'No always-open call matches.',
  watch: 'No event to watch matches.',
};

const GO_TO_LANE: Record<Lane, (count: number) => string> = {
  closing: (count) => `See ${count.toLocaleString('en-US')} closing`,
  open: (count) => `See ${count.toLocaleString('en-US')} always open`,
  watch: (count) => `See ${count.toLocaleString('en-US')} to watch`,
};

/** A placeholder in the shape of a call's row, for any list of them while it loads. */
export function CallRowSkeleton() {
  return (
    <li className={CALL_ROW_GRID} aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-10" />
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <div className="hidden space-y-2 lg:block">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="col-start-2 flex gap-2 md:col-start-auto">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-20" />
      </div>
    </li>
  );
}

const rowList = 'border-t';

/**
 * The rows of one lane: on the page, with a hairline between them. An empty
 * lane says which lane does have calls under the same filters.
 */
export function CallList({
  opportunities,
  isLoading,
  lane,
  counts,
  locations,
  isFiltered,
  onLaneChange,
  onClearFilters,
  page,
  totalPages,
  showPagination,
  onPageChange,
}: CallListProps) {
  const heading = <h2 className="sr-only">{LANE_HEADINGS[lane]}</h2>;

  if (isLoading) {
    return (
      <section aria-busy="true">
        {heading}
        <ul className={rowList}>
          {Array.from({ length: 6 }).map((_, index) => (
            <CallRowSkeleton key={index} />
          ))}
        </ul>
      </section>
    );
  }

  if (opportunities.length === 0) {
    const otherLanes = LANES.filter((other) => other !== lane && (counts?.[other] ?? 0) > 0);
    return (
      <section className="border-t py-14">
        {heading}
        <p className="heading text-foreground">{NOTHING_HERE[lane]}</p>
        <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
          {otherLanes.length > 0
            ? 'The same search has calls in another list.'
            : isFiltered
              ? 'Clear a filter, or run a live search to look for new calls.'
              : 'Nothing is listed here right now.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {otherLanes.map((other) => (
            <Button key={other} variant="outline" size="sm" onClick={() => onLaneChange(other)}>
              {GO_TO_LANE[other](counts?.[other] ?? 0)}
            </Button>
          ))}
          {isFiltered && (
            <Button variant="ghost" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </section>
    );
  }

  // With a place asked for, the server lists the calls held there first, then
  // the ones held online; a live search can add calls held somewhere else.
  const hasLocationFilter = Boolean(locations && locations.length > 0);
  const inPlace = hasLocationFilter ? opportunities.filter((item) => item.matchesLocationFilter) : opportunities;
  const online = hasLocationFilter ? opportunities.filter((item) => !item.matchesLocationFilter && item.isRemote) : [];
  const elsewhere = hasLocationFilter ? opportunities.filter((item) => !item.matchesLocationFilter && !item.isRemote) : [];
  const groups = [
    { title: 'Online', rows: online },
    { title: 'Elsewhere', rows: elsewhere },
  ].filter((group) => group.rows.length > 0);

  return (
    <section>
      {heading}
      {inPlace.length > 0 ? (
        <ul className={rowList}>
          {inPlace.map((opportunity) => (
            <CallRow key={opportunity.id} opportunity={opportunity} />
          ))}
        </ul>
      ) : (
        // Later pages can hold only online calls: the ones in the place came first.
        page === 1 && <p className="border-t py-6 text-sm text-muted-foreground">Nothing found in {locations!.join(', ')}.</p>
      )}

      {groups.map((group, index) => (
        <div key={group.title}>
          <h3 className={cn('heading pb-3 text-foreground', inPlace.length > 0 || index > 0 ? 'pt-10' : 'pt-4')}>{group.title}</h3>
          <ul className={rowList}>
            {group.rows.map((opportunity) => (
              <CallRow key={opportunity.id} opportunity={opportunity} />
            ))}
          </ul>
        </div>
      ))}

      {showPagination && totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="Go to previous page"
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <span className="px-3 text-sm tabular-nums text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            aria-label="Go to next page"
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </section>
  );
}
