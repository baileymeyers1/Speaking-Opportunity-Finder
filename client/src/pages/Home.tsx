import { useState, useEffect, useCallback, useRef } from 'react';
import { FilterPanel } from '../components/FilterPanel';
import { OpportunityList } from '../components/OpportunityList';
import { apiClient } from '../api/client';
import type { Opportunity, OpportunityFilters, PaginatedResponse } from '../types';
import { useDebounce } from '../hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';

const CACHE_KEY = 'cachedOpportunities';
const FILTERS_KEY = 'opportunityFiltersState';
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

export function Home() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OpportunityFilters>({});
  const debouncedFilters = useDebounce(filters, 400);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveResultCount, setLiveResultCount] = useState(0);
  const cacheLoaded = useRef(false);
  const filtersHydrated = useRef(false);

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

  // Restore filters + page from session (for back navigation / tab switch)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      if (!raw) {
        filtersHydrated.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as { filters: OpportunityFilters; page: number };
      if (parsed?.filters) {
        setFilters(parsed.filters);
      }
      if (parsed?.page) {
        setPage(parsed.page);
      }
    } catch {
      // ignore parse issues
    } finally {
      filtersHydrated.current = true;
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
      // Only show error if we don't have cached data to fall back on
      if (!cacheLoaded.current && opportunities.length === 0) {
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

  useEffect(() => {
    if (!filtersHydrated.current) return;
    sessionStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ filters, page })
    );
  }, [filters, page]);

  const handleFiltersChange = (newFilters: OpportunityFilters) => {
    setFilters(newFilters);
    setPage(1);
    setLiveResultCount(0);
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

  const handleRetry = () => {
    setError(null);
    fetchOpportunities(false);
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

      <FilterPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onLiveSearch={handleLiveSearch}
        isSearching={isSearching}
      />

      {/* Stale cache indicator */}
      {isStale && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Showing cached results while loading fresh data...
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-12 text-center">
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
            <div className="flex items-center justify-between">
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
                    <X className="h-4 w-4" />
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
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
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
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Home;
