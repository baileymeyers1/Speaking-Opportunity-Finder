import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterPanel } from '../components/FilterPanel';
import { OpportunityList } from '../components/OpportunityList';
import { SavedSearches } from '../components/SavedSearches';
import { apiClient } from '../api/client';
import type { Opportunity, OpportunityFilters, OpportunityFormat, PaginatedResponse } from '../types';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../hooks/useAuth';
import { upsertLiveResults } from '../utils/liveResultsCache';
import { Button } from '@/components/ui/button';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Loader2, X } from 'lucide-react';

const CACHE_KEY = 'cachedOpportunities';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

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

function parseFiltersFromParams(searchParams: URLSearchParams): OpportunityFilters {
  const filters: OpportunityFilters = {};
  const q = searchParams.get('q');
  if (q) filters.search = q;
  const industries = searchParams.getAll('industries');
  if (industries.length) filters.industries = industries;
  const locations = searchParams.getAll('locations');
  if (locations.length) filters.locations = locations;
  const types = searchParams.getAll('types');
  if (types.length) filters.format = types as OpportunityFormat[];
  const sort = searchParams.get('sort');
  if (sort) filters.sortBy = sort as OpportunityFilters['sortBy'];
  return filters;
}

function filtersToParams(filters: OpportunityFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.sortBy) params.set('sort', filters.sortBy);
  if (page > 1) params.set('page', String(page));
  filters.industries?.forEach((i) => params.append('industries', i));
  filters.locations?.forEach((l) => params.append('locations', l));
  filters.format?.forEach((f) => params.append('types', f));
  return params;
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
  const [filters, setFilters] = useState<OpportunityFilters>(() => parseFiltersFromParams(searchParams));
  const debouncedFilters = useDebounce(filters, 400);
  const [page, setPage] = useState(() => {
    const p = searchParams.get('page');
    return p ? Math.max(1, parseInt(p, 10)) : 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveResultCount, setLiveResultCount] = useState(0);
  const cacheLoaded = useRef(false);
  const filtersHydrated = useRef(true);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISSED_KEY) === 'true'
  );

  // Load cached results on first mount (before API call)
  useEffect(() => {
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
    if (!filtersHydrated.current) return;
    if (!cacheLoaded.current && !liveSearch) {
      setIsLoading(true);
    }
    if (liveSearch) {
      setIsSearching(true);
    }
    setError(null);
    setRateLimitWarning(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (debouncedFilters.search) params.set('search', debouncedFilters.search);
      if (debouncedFilters.isRemote) params.set('isRemote', 'true');
      if (debouncedFilters.compensationMin) params.set('compensationMin', String(debouncedFilters.compensationMin));
      if (debouncedFilters.compensationMax) params.set('compensationMax', String(debouncedFilters.compensationMax));
      if (debouncedFilters.sortBy) params.set('sortBy', debouncedFilters.sortBy);
      if (debouncedFilters.qualityMin !== undefined) params.set('qualityMin', String(debouncedFilters.qualityMin));

      debouncedFilters.locations?.forEach((loc) => params.append('location', loc));
      debouncedFilters.format?.forEach((f) => params.append('format', f));
      debouncedFilters.industries?.forEach((i) => params.append('industries', i));
      debouncedFilters.compensationType?.forEach((c) => params.append('compensationType', c));

      if (liveSearch) {
        params.set('liveSearch', 'true');
      }

      const response = await apiClient.get<PaginatedResponse<Opportunity>>(
        `/opportunities?${params.toString()}`
      );

      if (response.data) {
        setOpportunities(response.data.items);
        setTotalPages(response.data.totalPages);
        setLiveResultCount(response.data.liveResultCount || 0);
        setLastUpdated(new Date());
        setIsStale(false);

        // Cache live results so detail page can find them
        const liveItems = response.data.items.filter((item) => item.isLiveResult);
        if (liveItems.length > 0) {
          upsertLiveResults(liveItems);
        }

        // Cache the default (unfiltered, page 1) response
        if (page === 1 && Object.keys(debouncedFilters).length === 0 && !liveSearch) {
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
  }, [debouncedFilters, page]);

  // Fetch DB results on filter/page changes
  useEffect(() => {
    fetchOpportunities(false);
  }, [fetchOpportunities]);

  // Clamp page to valid range when totalPages changes
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  // Sync filters + page to URL search params
  useEffect(() => {
    if (!filtersHydrated.current) return;
    const newParams = filtersToParams(filters, page);
    setSearchParams(newParams, { replace: true });
  }, [filters, page, setSearchParams]);

  const handleFiltersChange = (newFilters: OpportunityFilters) => {
    setFilters(newFilters);
    setPage(1);
    setLiveResultCount(0);
    setRateLimitWarning(null);
  };

  const handleClearFilters = () => {
    setFilters({});
    setPage(1);
    setLiveResultCount(0);
  };

  const handleLiveSearch = async () => {
    if (!filters.search && !filters.industries?.length) {
      alert('Please enter a search term or select an industry to perform a live search.');
      return;
    }
    fetchOpportunities(true);
  };

  const handleClearLiveResults = () => {
    setLiveResultCount(0);
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
    const applied: OpportunityFilters = {};
    if (query) applied.search = query;
    if (Array.isArray(savedFilters.industries)) applied.industries = savedFilters.industries as string[];
    if (Array.isArray(savedFilters.locations)) applied.locations = savedFilters.locations as string[];
    if (Array.isArray(savedFilters.format)) applied.format = savedFilters.format as OpportunityFormat[];
    if (Array.isArray(savedFilters.compensationType)) applied.compensationType = savedFilters.compensationType as OpportunityFilters['compensationType'];
    if (savedFilters.sortBy) applied.sortBy = savedFilters.sortBy as OpportunityFilters['sortBy'];
    if (savedFilters.isRemote) applied.isRemote = savedFilters.isRemote as boolean;
    if (typeof savedFilters.compensationMin === 'number') applied.compensationMin = savedFilters.compensationMin;
    if (typeof savedFilters.compensationMax === 'number') applied.compensationMax = savedFilters.compensationMax;
    if (typeof savedFilters.qualityMin === 'number') applied.qualityMin = savedFilters.qualityMin;
    setFilters(applied);
    setPage(1);
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
            currentFilters={filters as Record<string, unknown>}
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

          <OpportunityList
            opportunities={opportunities}
            isLoading={isLoading}
            onClearFilters={handleClearFilters}
          />

          {/* Pagination */}
          {totalPages > 1 && !isLoading && liveResultCount === 0 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
