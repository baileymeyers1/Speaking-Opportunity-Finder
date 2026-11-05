import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterPanel } from '../components/FilterPanel';
import { OpportunityGrid } from '../components/OpportunityGrid';
import { LiveSearchBanner } from '../components/LiveSearchBanner';
import { SavedSearches } from '../components/SavedSearches';
import { isRateLimitError } from '../api/client';
import type { OpportunityFilters } from '../types';
import {
  canLiveSearch,
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
import { AlertCircle, Loader2, Sparkles, X } from 'lucide-react';

const BANNER_DISMISSED_KEY = 'loginBannerDismissed';

/** Filters and page live in the URL; this is the only place that writes them. */
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
  return { filters, page: filters.page ?? 1, updateFilters, setPage };
}

export function Home() {
  const { isAuthenticated } = useAuth();
  const { filters, page, updateFilters, setPage } = useBrowseFilters();
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
  const backgroundChecksResumeAt = data?.backgroundChecksResumeAt ?? null;
  const isLoading = data === undefined && query.isPending;
  const isRefreshing = data !== undefined && query.isFetching;
  const lastUpdated =
    data !== undefined && !query.isPlaceholderData && query.dataUpdatedAt > 0
      ? new Date(query.dataUpdatedAt)
      : null;

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

  const handleFiltersChange = (next: OpportunityFilters) => updateFilters(() => ({ ...next, page: 1 }));
  const handleClearFilters = () => updateFilters(() => ({}));
  const handleLiveSearch = (effective: OpportunityFilters) => {
    if (!canLiveSearch(effective)) return;
    updateFilters(() => ({ ...effective, page: 1 }));
    liveSearch.run(effective);
  };
  const handleApplySavedSearch = (savedQuery: string, savedFilters: Record<string, unknown>) =>
    updateFilters(() => savedSearchToFilters(savedQuery, savedFilters));
  const handleDismissBanner = () => {
    setBannerDismissed(true);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  const hasLocationFilter = Boolean(filters.locations && filters.locations.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Find Speaking Opportunities</h1>
        <p className="text-muted-foreground mt-1">
          Discover conferences, meetups, and events looking for speakers
        </p>
      </div>

      {/* Saved Searches sits beside the filters on wide screens and under them on phones */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1 min-w-0">
          <FilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onLiveSearch={handleLiveSearch}
            isSearching={liveSearch.isSearching}
            matchSortAvailable={hasProfile}
          />
        </div>
        {isAuthenticated && (
          <SavedSearches
            currentQuery={filters.search || ''}
            currentFilters={{ ...filters, page: undefined } as Record<string, unknown>}
            onApplySearch={handleApplySavedSearch}
          />
        )}
      </div>

      {isRefreshing && (
        <div
          className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Showing cached results while loading fresh data...
        </div>
      )}

      {needsProfile && (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
          <span>
            <Link to="/profile" className="font-medium text-primary hover:underline">Set up your speaker profile</Link>
            {' '}to see a match score on every opportunity and sort by best match.
          </span>
        </p>
      )}

      {!isAuthenticated && !bannerDismissed && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            <Link to="/register" className="font-medium text-primary hover:underline">Sign up</Link>
            {' '}or{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">log in</Link>
            {' '}to save opportunities and searches.
          </p>
          <Button variant="ghost" size="icon" onClick={handleDismissBanner} aria-label="Dismiss banner">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {loadError ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-12 text-center"
        >
          <div className="rounded-full bg-destructive/10 p-3 mb-4">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Something went wrong</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Failed to load opportunities. Please check your connection and try again.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {!isLoading && (
            <LiveSearchBanner
              resultCount={opportunities.length}
              liveResultCount={liveResultCount}
              pendingLiveHits={pendingLiveHits}
              liveFoundCount={liveFoundCount}
              liveNotOpenCount={liveNotOpenCount}
              backgroundChecksResumeAt={backgroundChecksResumeAt}
              locationMatchedCount={
                hasLocationFilter ? opportunities.filter((item) => item.matchesLocationFilter).length : null
              }
              lastUpdated={lastUpdated}
              isRefreshing={isRefreshing}
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
          <OpportunityGrid
            opportunities={opportunities}
            isLoading={isLoading}
            locations={filters.locations}
            onClearFilters={handleClearFilters}
            page={page}
            totalPages={data?.totalPages ?? 1}
            showPagination={liveResultCount === 0}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

export default Home;
