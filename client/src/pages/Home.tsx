import { useState, useEffect, useCallback, useRef } from 'react';
import { FilterPanel } from '../components/FilterPanel';
import { OpportunityList } from '../components/OpportunityList';
import { apiClient } from '../api/client';
import type { Opportunity, OpportunityFilters, PaginatedResponse } from '../types';
import { useDebounce } from '../hooks/useDebounce';

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
    } catch (error) {
      console.error('Failed to fetch opportunities:', error);
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

  const handleLiveSearch = async () => {
    if (!filters.search && !filters.industries?.length) {
      alert('Please enter a search term or select an industry to perform a live search.');
      return;
    }
    // Directly call with liveSearch=true -- no need for intermediate state
    fetchOpportunities(true);
  };

  const handleClearLiveResults = () => {
    setLiveResultCount(0);
    fetchOpportunities(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Find Speaking Opportunities
      </h1>

      <FilterPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onLiveSearch={handleLiveSearch}
        isSearching={isSearching}
      />

      {liveResultCount > 0 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            Showing {opportunities.length} results
            <span className="ml-1">
              ({liveResultCount} from live search)
            </span>
          </p>
          <button
            onClick={handleClearLiveResults}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear live results
          </button>
        </div>
      )}

      <div>
        {isStale && (
          <p className="text-xs text-gray-400 mb-2">
            Showing cached results while loading fresh data...
          </p>
        )}
        {lastUpdated && !isStale && liveResultCount === 0 && (
          <p className="text-xs text-gray-400 mb-2">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
        <OpportunityList
          opportunities={opportunities}
          isLoading={isLoading}
        />
      </div>

      {totalPages > 1 && liveResultCount === 0 && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default Home;
