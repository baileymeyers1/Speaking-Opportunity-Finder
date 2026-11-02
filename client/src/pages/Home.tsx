import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterPanel } from '../components/FilterPanel';
import { OpportunityList } from '../components/OpportunityList';
import { SavedSearches } from '../components/SavedSearches';
import { apiClient } from '../api/client';
import type { Opportunity, OpportunityFilters, PaginatedResponse } from '../types';
import {
  filtersToApiQuery,
  filtersToSearchParams,
  savedSearchToFilters,
  searchParamsToFilters,
  type BrowseFilters,
} from '../filters/serialize';
import { useAuth } from '../hooks/useAuth';
import { upsertLiveResults } from '../utils/liveResultsCache';
import { Button } from '@/components/ui/button';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Loader2, X } from 'lucide-react';

const CACHE_KEY = 'cachedOpportunities';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const LIVE_SEARCH_CACHE_KEY = 'liveSearchCache';

function loadCache(): { items: Opportunity[]; totalPages: number; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_MAX_AGE) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

const BANNER_DISMISSED_KEY = 'loginBannerDismissed';

export function Home() {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);
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
  const [totalPages, setTotalPages] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveResultCount, setLiveResultCount] = useState(0);
  // Store all live search results so we can re-sort/filter client-side
  const allLiveResults = useRef<Opportunity[]>([]);
  const cacheLoaded = useRef(false);
  const skipNextFetch = useRef(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISSED_KEY) === 'true'
  );

  // Load cached results on first mount (before API call)
  useEffect(() => {
    // Check if we have live search results cached for the current URL params
    try {
      const liveRaw = sessionStorage.getItem(LIVE_SEARCH_CACHE_KEY);
      if (liveRaw) {
        const liveCached = JSON.parse(liveRaw);
        // Restore if cache is fresh (< 5 min) and was built for the current URL
        const currentParams = filtersToApiQuery({ ...filters, page: 1 }, { liveSearch: true });

        if (
          Date.now() - liveCached.timestamp < 5 * 60 * 1000 &&
          liveCached.params === currentParams.toString()
        ) {
          setOpportunities(liveCached.items);
          allLiveResults.current = liveCached.items;
          setTotalPages(liveCached.totalPages);
          setLiveResultCount(liveCached.liveResultCount);
          setLastUpdated(new Date(liveCached.timestamp));
          setIsLoading(false);
          setIsStale(false);
          cacheLoaded.current = true;
          skipNextFetch.current = true;
          return;
        }
      }
    } catch { /* ignore */ }

    const cached = loadCache();
    if (cached) {
      setOpportunities(cached.items);
      setTotalPages(cached.totalPages);
      setLastUpdated(new Date(cached.timestamp));
      setIsLoading(false);
      setIsStale(true);
      cacheLoaded.current = true;
    }
  }, []);

  const fetchOpportunities = useCallback(async (liveSearch = false) => {
    // Skip the automatic re-fetch if we just restored from live cache
    if (skipNextFetch.current && !liveSearch) {
      skipNextFetch.current = false;
      return;
    }
    // If we have active live results and this is a non-live fetch (sort/filter change),
    // re-sort the existing results client-side instead of losing them
    if (!liveSearch && allLiveResults.current.length > 0) {
      const sortBy = filters.sortBy || 'deadline';
      const sorted = [...allLiveResults.current].sort((a, b) => {
        const dateVal = (v: string | null) => {
          if (!v) return Number.MAX_SAFE_INTEGER;
          const d = new Date(v).getTime();
          return isNaN(d) ? Number.MAX_SAFE_INTEGER : d;
        };
        if (sortBy === 'quality') return (b.qualityScore || 0) - (a.qualityScore || 0);
        if (sortBy === 'eventDate') return dateVal(a.eventDate) - dateVal(b.eventDate);
        return dateVal(a.cfpDeadline) - dateVal(b.cfpDeadline);
      });
      setOpportunities(sorted);
      return;
    }
    if (!cacheLoaded.current && !liveSearch) {
      setIsLoading(true);
    }
    if (liveSearch) {
      setIsSearching(true);
    }
    setError(null);
    setRateLimitWarning(null);
    try {
      const params = filtersToApiQuery(filters, { liveSearch });

      const response = await apiClient.get<PaginatedResponse<Opportunity>>(
        `/opportunities?${params.toString()}`
      );

      if (response.data) {
        setOpportunities(response.data.items);
        setTotalPages(response.data.totalPages);
        setLiveResultCount(response.data.liveResultCount || 0);
        setLastUpdated(new Date());
        setIsStale(false);

        // Store all results when live search is active so we can re-sort client-side
        if (liveSearch && (response.data.liveResultCount ?? 0) > 0) {
          allLiveResults.current = response.data.items;
        }

        // Cache live results so detail page can find them
        const liveItems = response.data.items.filter((item) => item.isLiveResult);
        if (liveItems.length > 0) {
          upsertLiveResults(liveItems);
        }

        // Cache live search results for back-navigation restoration
        if (liveSearch && (response.data.liveResultCount ?? 0) > 0) {
          try {
            sessionStorage.setItem(LIVE_SEARCH_CACHE_KEY, JSON.stringify({
              params: params.toString(),
              items: response.data.items,
              totalPages: response.data.totalPages,
              liveResultCount: response.data.liveResultCount,
              timestamp: Date.now(),
            }));
          } catch { /* ignore storage errors */ }
        }

        // Cache the default (unfiltered, page 1) response
        if (page === 1 && Object.keys(filters).length === 0 && !liveSearch) {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            items: response.data.items,
            totalPages: response.data.totalPages,
            timestamp: Date.now(),
          }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch opportunities:', err);
      const errorMessage = err instanceof Error ? err.message : '';
      const isRateLimit = errorMessage.toLowerCase().includes('too many');
      if (isRateLimit) {
        setRateLimitWarning('Search limit reached. Showing cached results. Try again in a moment.');
      } else if (!cacheLoaded.current && opportunities.length === 0) {
        setError('Failed to load opportunities. Please check your connection and try again.');
      }
    } finally {
      setIsLoading(false);
      setIsSearching(false);
      cacheLoaded.current = false;
    }
  }, [filters, page]);

  // Fetch DB results on filter/page changes
  useEffect(() => {
    fetchOpportunities(false);
  }, [fetchOpportunities]);

  // Clamp page to valid range when totalPages changes
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page, setPage]);

  const handleFiltersChange = (newFilters: OpportunityFilters) => {
    updateFilters(() => ({ ...newFilters, page: 1 }));
    // Don't clear live results on filter/sort changes — we re-sort client-side
    if (allLiveResults.current.length === 0) {
      setLiveResultCount(0);
    }
    setRateLimitWarning(null);
  };

  const handleClearFilters = () => {
    updateFilters(() => ({}));
    setLiveResultCount(0);
  };

  const handleLiveSearch = (effective: OpportunityFilters) => {
    if (!effective.search && !effective.industries?.length) {
      return;
    }
    updateFilters(() => ({ ...effective, page: 1 }));
    fetchOpportunities(true);
  };

  const handleClearLiveResults = () => {
    setLiveResultCount(0);
    allLiveResults.current = [];
    sessionStorage.removeItem(LIVE_SEARCH_CACHE_KEY);
    fetchOpportunities(false);
  };

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  const handleRetry = () => {
    setError(null);
    fetchOpportunities(false);
  };

  const handleApplySavedSearch = (query: string, savedFilters: Record<string, unknown>) => {
    updateFilters(() => savedSearchToFilters(query, savedFilters));
  };

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
            isSearching={isSearching}
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

      {/* Stale cache indicator */}
      {isStale && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Showing cached results while loading fresh data...
        </div>
      )}

      {/* Rate limit warning banner */}
      {rateLimitWarning && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300" role="status" aria-live="polite">
          <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {rateLimitWarning}
          <button
            onClick={() => setRateLimitWarning(null)}
            className="ml-auto rounded-full p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
            aria-label="Dismiss rate limit warning"
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
      {error && !isLoading && (
        <div role="alert" className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-12 text-center">
          <div className="rounded-full bg-destructive/10 p-3 mb-4">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Something went wrong
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {error}
          </p>
          <Button variant="outline" className="mt-4" onClick={handleRetry}>
            Try again
          </Button>
        </div>
      )}

      {/* Results header + list (only when no error) */}
      {!error && (
        <>
          {/* Results header */}
          {!isLoading && opportunities.length > 0 && (
            <div className="flex items-center justify-between" aria-live="polite">
              <p className="text-sm text-muted-foreground">
                Showing {opportunities.length} result{opportunities.length !== 1 ? 's' : ''}
                {filters.locations && filters.locations.length > 0 && (
                  <span className="ml-1">
                    ({opportunities.filter(o => o.matchesLocationFilter).length} in your area)
                  </span>
                )}
                {liveResultCount > 0 && (
                  <span className="ml-1">
                    ({liveResultCount} from live search)
                  </span>
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
                {lastUpdated && !isStale && liveResultCount === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          )}

          {(() => {
            const hasLocationFilter = filters.locations && filters.locations.length > 0;
            const locationMatched = hasLocationFilter
              ? opportunities.filter(o => o.matchesLocationFilter)
              : opportunities;
            const otherResults = hasLocationFilter
              ? opportunities.filter(o => !o.matchesLocationFilter)
              : [];

            return (
              <>
                {/* Location-matched results (or all results when no location filter) */}
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
                  <OpportunityList
                    opportunities={[]}
                    isLoading={isLoading}
                    onClearFilters={handleClearFilters}
                  />
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
                    <OpportunityList
                      opportunities={otherResults}
                      isLoading={false}
                    />
                  </>
                )}
              </>
            );
          })()}

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
