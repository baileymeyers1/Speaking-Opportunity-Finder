import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterPanel } from '../components/FilterPanel';
import { OpportunityList } from '../components/OpportunityList';
import { SavedSearches } from '../components/SavedSearches';
import { isRateLimitError } from '../api/client';
import type { OpportunityFilters } from '../types';
import {
  canLiveSearch,
  filtersToSearchParams,
  savedSearchToFilters,
  searchParamsToFilters,
  type BrowseFilters,
} from '../filters/serialize';
import { useAuth } from '../hooks/useAuth';
import { useOpportunities } from '../hooks/useOpportunities';
import { useLiveSearch } from '../hooks/useLiveSearch';
import { Button } from '@/components/ui/button';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Loader2, X } from 'lucide-react';

const BANNER_DISMISSED_KEY = 'loginBannerDismissed';

export function Home() {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the only source of filter state.
  const filters = useMemo(() => searchParamsToFilters(searchParams), [searchParams]);
  const page = filters.page ?? 1;
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

  const query = useOpportunities(filters);
  const liveSearch = useLiveSearch(filters);
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISSED_KEY) === 'true'
  );

  const data = query.data;
  const opportunities = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const liveResultCount = data?.liveResultCount ?? 0;
  const isLoading = data === undefined && query.isPending;
  const isRefreshing = data !== undefined && query.isFetching;
  const lastUpdated =
    data !== undefined && !query.isPlaceholderData && query.dataUpdatedAt > 0
      ? new Date(query.dataUpdatedAt)
      : null;

  const rateLimited =
    !rateLimitDismissed && (isRateLimitError(query.error) || isRateLimitError(liveSearch.error));
  const loadError = query.error && data === undefined && !isRateLimitError(query.error);
  const liveError = liveSearch.error && !isRateLimitError(liveSearch.error);

  // Clamp page to the valid range when the result count shrinks
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page, setPage]);

  useEffect(() => {
    setRateLimitDismissed(false);
  }, [filters]);

  const handleFiltersChange = (newFilters: OpportunityFilters) => {
    updateFilters(() => ({ ...newFilters, page: 1 }));
  };

  const handleClearFilters = () => {
    updateFilters(() => ({}));
  };

  const handleLiveSearch = (effective: OpportunityFilters) => {
    if (!canLiveSearch(effective)) return;
    updateFilters(() => ({ ...effective, page: 1 }));
    liveSearch.run(effective);
  };

  const handleClearLiveResults = () => {
    query.refetch();
  };

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  const handleApplySavedSearch = (savedQuery: string, savedFilters: Record<string, unknown>) => {
    updateFilters(() => savedSearchToFilters(savedQuery, savedFilters));
  };

  const hasLocationFilter = Boolean(filters.locations && filters.locations.length > 0);
  const locationMatched = hasLocationFilter
    ? opportunities.filter((o) => o.matchesLocationFilter)
    : opportunities;
  const otherResults = hasLocationFilter ? opportunities.filter((o) => !o.matchesLocationFilter) : [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Find Speaking Opportunities
        </h1>
        <p className="text-muted-foreground mt-1">
          Discover conferences, meetups, and events looking for speakers
        </p>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-1">
          <FilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onLiveSearch={handleLiveSearch}
            isSearching={liveSearch.isSearching}
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

      {/* Background refresh indicator */}
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

      {/* Rate limit warning banner */}
      {rateLimited && (
        <div
          className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
          role="status"
          aria-live="polite"
        >
          <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          Search limit reached. Showing cached results. Try again in a moment.
          <button
            onClick={() => {
              setRateLimitDismissed(true);
              liveSearch.reset();
            }}
            className="ml-auto rounded-full p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
            aria-label="Dismiss rate limit warning"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Live search failure (results from the database still show) */}
      {liveError && (
        <div
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-foreground"
          role="status"
          aria-live="polite"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" aria-hidden="true" />
          Live search failed. Showing stored results only.
          <button
            onClick={() => liveSearch.reset()}
            className="ml-auto rounded-full p-0.5 hover:bg-muted transition-colors"
            aria-label="Dismiss live search error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Log in to save banner */}
      {!isAuthenticated && !bannerDismissed && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
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

      {/* Error state */}
      {loadError && (
        <div role="alert" className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-12 text-center">
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
      )}

      {!loadError && (
        <>
          {/* Results header */}
          {!isLoading && opportunities.length > 0 && (
            <div className="flex items-center justify-between" aria-live="polite">
              <p className="text-sm text-muted-foreground">
                Showing {opportunities.length} result{opportunities.length !== 1 ? 's' : ''}
                {hasLocationFilter && (
                  <span className="ml-1">({locationMatched.length} in your area)</span>
                )}
                {liveResultCount > 0 && (
                  <span className="ml-1">({liveResultCount} from live search)</span>
                )}
              </p>
              <div className="flex items-center gap-3">
                {liveResultCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearLiveResults}
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Clear live results
                  </Button>
                )}
                {lastUpdated && !isRefreshing && liveResultCount === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          )}

          {locationMatched.length > 0 ? (
            <OpportunityList
              opportunities={locationMatched}
              isLoading={isLoading}
              onClearFilters={handleClearFilters}
            />
          ) : hasLocationFilter && !isLoading ? (
            <p className="text-sm text-muted-foreground py-4">
              No results found in {filters.locations!.join(', ')}
            </p>
          ) : (
            <OpportunityList opportunities={[]} isLoading={isLoading} onClearFilters={handleClearFilters} />
          )}

          {otherResults.length > 0 && !isLoading && (
            <>
              <div className="flex items-center gap-3 pt-6 pb-2">
                <div className="h-px flex-1 bg-border" />
                <p className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  More Speaking Opportunities
                </p>
                <div className="h-px flex-1 bg-border" />
              </div>
              <OpportunityList opportunities={otherResults} isLoading={false} />
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && !isLoading && liveResultCount === 0 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                aria-label="Go to previous page"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                aria-label="Go to next page"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export default Home;
