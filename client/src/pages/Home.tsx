import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterPanel } from '../components/FilterPanel';
import { CallList } from '../components/browse/CallList';
import { LaneCaption } from '../components/browse/LaneCaption';
import { LaneSwitch } from '../components/browse/LaneSwitch';
import { SortSelect } from '../components/browse/SortSelect';
import { LiveSearchBanner } from '../components/LiveSearchBanner';
import { SavedSearches } from '../components/SavedSearches';
import { isRateLimitError } from '../api/client';
import type { Lane, OpportunityFilters, SortBy } from '../types';
import { DEFAULT_LANE } from '../filters/constants';
import {
  canLiveSearch,
  countActiveFilters,
  filtersToSearchParams,
  savedSearchToFilters,
  searchParamsToFilters,
  serializeFilters,
  type BrowseFilters,
} from '../filters/serialize';
import { useAuth } from '../hooks/useAuth';
import { useOpportunities } from '../hooks/useOpportunities';
import { useLiveSearch } from '../hooks/useLiveSearch';
import { useProfile } from '../hooks/useProfile';
import { Button } from '@/components/ui/button';
import { AlertCircle, Sparkles, X } from 'lucide-react';

const BANNER_DISMISSED_KEY = 'loginBannerDismissed';

/** Filters, lane and page live in the URL; this is the only place that writes them. */
function useBrowseFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => searchParamsToFilters(searchParams), [searchParams]);
  const updateFilters = useCallback(
    (updater: (previous: BrowseFilters) => BrowseFilters) => {
      setSearchParams(
        (previous) => filtersToSearchParams(updater(searchParamsToFilters(previous))),
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const setPage = useCallback(
    (nextPage: number) => updateFilters((previous) => ({ ...previous, page: nextPage })),
    [updateFilters]
  );
  return { filters, lane: filters.lane ?? DEFAULT_LANE, page: filters.page ?? 1, updateFilters, setPage };
}

export function Home() {
  const { isAuthenticated } = useAuth();
  const { filters, lane, page, updateFilters, setPage } = useBrowseFilters();
  const query = useOpportunities(filters);
  const liveSearch = useLiveSearch(filters);
  const profileQuery = useProfile({ enabled: isAuthenticated });
  const hasProfile = Boolean(profileQuery.data);
  const needsProfile = isAuthenticated && profileQuery.isSuccess && profileQuery.data === null;
  // The dismissal is remembered per filter set, so a new search shows the notice again.
  const [rateLimitDismissedFor, setRateLimitDismissedFor] = useState<string | null>(null);
  const rateLimitDismissed = rateLimitDismissedFor === serializeFilters(filters);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISSED_KEY) === 'true'
  );

  const data = query.data;
  const opportunities = data?.items ?? [];
  const liveResultCount = data?.liveResultCount ?? 0;
  const pendingLiveHits = data?.pendingLiveHits ?? [];
  const liveFoundCount = data?.liveFoundCount ?? 0;
  const liveNotOpenCount = data?.liveNotOpenCount ?? 0;
  const liveNoCallCount = data?.liveNoCallCount ?? 0;
  const backgroundChecksResumeAt = data?.backgroundChecksResumeAt ?? null;
  const isLoading = data === undefined && query.isPending;
  const isRefreshing = data !== undefined && query.isFetching;

  const rateLimited =
    !rateLimitDismissed && (isRateLimitError(query.error) || isRateLimitError(liveSearch.error));
  const loadError = Boolean(query.error) && data === undefined && !isRateLimitError(query.error);
  const liveSearchFailed = Boolean(liveSearch.error) && !isRateLimitError(liveSearch.error);

  // Clamp page to the valid range when the result count shrinks
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page, setPage]);

  // A change of filters keeps the lane: the lane is which list is showing, not what is being looked for.
  const handleFiltersChange = (next: OpportunityFilters) =>
    updateFilters((previous) => ({ ...next, lane: previous.lane, page: 1 }));
  const handleClearFilters = () => updateFilters((previous) => ({ lane: previous.lane }));
  const handleLaneChange = (next: Lane) => updateFilters((previous) => ({ ...previous, lane: next, page: 1 }));
  const handleSortChange = (sortBy: SortBy) => updateFilters((previous) => ({ ...previous, sortBy, page: 1 }));
  const handleLiveSearch = (effective: OpportunityFilters) => {
    if (!canLiveSearch(effective)) return;
    updateFilters((previous) => ({ ...effective, lane: previous.lane, page: 1 }));
    liveSearch.run({ ...effective, lane });
  };
  const handleApplySavedSearch = (savedQuery: string, savedFilters: Record<string, unknown>) =>
    updateFilters(() => savedSearchToFilters(savedQuery, savedFilters));
  const handleDismissBanner = () => {
    setBannerDismissed(true);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  const hasLocationFilter = Boolean(filters.locations && filters.locations.length > 0);
  const isFiltered = Boolean(filters.search) || countActiveFilters(filters) > 0;

  return (
    <div className="space-y-5">
      {/* The page is the list. Its name is for screen readers and the tab; the "Browse" tab says where you are. */}
      <h1 className="sr-only">Calls for speakers</h1>

      {/* Two rows before the first call: what to look for, then which list and in what order. */}
      <FilterPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onLiveSearch={handleLiveSearch}
        isSearching={liveSearch.isSearching}
        actions={
          isAuthenticated && (
            <SavedSearches
              currentQuery={filters.search || ''}
              currentFilters={{ ...filters, lane: undefined, page: undefined } as Record<string, unknown>}
              onApplySearch={handleApplySavedSearch}
            />
          )
        }
      />

      {loadError ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-12 text-center"
        >
          <div className="rounded-full bg-destructive/10 p-3 mb-4">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-lg font-medium text-foreground">Something went wrong</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Failed to load opportunities. Please check your connection and try again.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <LaneSwitch lane={lane} counts={data?.lanes?.counts} onChange={handleLaneChange} />
            <LaneCaption lane={lane} lanes={data?.lanes} isRefreshing={isRefreshing} />
            <div className="ml-auto">
              <SortSelect value={filters.sortBy} lane={lane} matchSortAvailable={hasProfile} onChange={handleSortChange} />
            </div>
          </div>
          {!isLoading && (
            <LiveSearchBanner
              resultCount={opportunities.length}
              liveResultCount={liveResultCount}
              pendingLiveHits={pendingLiveHits}
              liveFoundCount={liveFoundCount}
              liveNotOpenCount={liveNotOpenCount}
              liveNoCallCount={liveNoCallCount}
              backgroundChecksResumeAt={backgroundChecksResumeAt}
              locationMatchedCount={
                hasLocationFilter ? opportunities.filter((item) => item.matchesLocationFilter).length : null
              }
              rateLimited={rateLimited}
              liveSearchFailed={liveSearchFailed}
              onClearLiveResults={() => query.refetch()}
              onDismissRateLimit={() => {
                setRateLimitDismissedFor(serializeFilters(filters));
                liveSearch.reset();
              }}
              onDismissLiveError={() => liveSearch.reset()}
            />
          )}
          <CallList
            opportunities={opportunities}
            isLoading={isLoading}
            lane={lane}
            counts={data?.lanes?.counts}
            locations={filters.locations}
            isFiltered={isFiltered}
            onLaneChange={handleLaneChange}
            onClearFilters={handleClearFilters}
            page={page}
            totalPages={data?.totalPages ?? 1}
            showPagination={liveResultCount === 0}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* What an account adds, after the list: the list is what the page is for. */}
      {needsProfile && (
        <p className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>
            <Link to="/profile" className="link font-medium">Set up your speaker profile</Link>
            {' '}to see a match score on every call and sort by best match.
          </span>
        </p>
      )}

      {!isAuthenticated && !bannerDismissed && (
        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            <Link to="/register" className="link font-medium">Sign up</Link>
            {' '}or{' '}
            <Link to="/login" className="link font-medium">log in</Link>
            {' '}to save opportunities and searches.
          </p>
          <Button variant="ghost" size="icon" onClick={handleDismissBanner} aria-label="Dismiss banner">
            <X aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default Home;
