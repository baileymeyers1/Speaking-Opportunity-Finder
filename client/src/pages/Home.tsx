import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FilterPanel } from '../components/FilterPanel';
import { OpportunityList } from '../components/OpportunityList';
import { apiClient } from '../api/client';
import type { Opportunity, OpportunityFilters, PaginatedResponse } from '../types';
import { upsertLiveResults } from '../utils/liveResultsCache';

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
  const [liveResults, setLiveResults] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [filters, setFilters] = useState<OpportunityFilters>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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

  // Restore filters + page from session (for back navigation)
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

  const fetchOpportunities = useCallback(async () => {
    if (!filtersHydrated.current) return;
    if (!cacheLoaded.current) {
      setIsLoading(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (filters.search) params.set('search', filters.search);
      if (filters.isRemote) params.set('isRemote', 'true');
      if (filters.compensationMin) params.set('compensationMin', String(filters.compensationMin));
      if (filters.compensationMax) params.set('compensationMax', String(filters.compensationMax));
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.qualityMin !== undefined) params.set('qualityMin', String(filters.qualityMin));

      filters.locations?.forEach((loc) => params.append('location', loc));
      filters.format?.forEach((f) => params.append('format', f));
      filters.industries?.forEach((i) => params.append('industries', i));
      filters.compensationType?.forEach((c) => params.append('compensationType', c));

      const response = await apiClient.get<PaginatedResponse<Opportunity>>(
        `/opportunities?${params.toString()}`
      );

      if (response.data) {
        setOpportunities(response.data.items);
        setTotalPages(response.data.totalPages);
        setLastUpdated(new Date());
        setIsStale(false);

        // Cache the default (unfiltered, page 1) response
        if (page === 1 && Object.keys(filters).length === 0) {
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
      cacheLoaded.current = false;
    }
  }, [filters, page]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  useEffect(() => {
    if (!filtersHydrated.current) return;
    sessionStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({
        filters,
        page,
      })
    );
  }, [filters, page]);

  const handleFiltersChange = (newFilters: OpportunityFilters) => {
    setFilters(newFilters);
    setPage(1);
    setLiveResults([]);
  };

  const handleLiveSearch = async () => {
    if (!filters.search && !filters.industries?.length) {
      alert('Please enter a search term or select an industry to perform a live search.');
      return;
    }

    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('query', filters.search);
      filters.industries?.forEach((i) => params.append('industries', i));

      const response = await apiClient.get<Opportunity[]>(
        `/opportunities/live-search?${params.toString()}`
      );

      if (response.data) {
        setLiveResults(response.data);
        upsertLiveResults(response.data);
      }
    } catch (error) {
      console.error('Failed to perform live search:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Merge live + stored, deduplicating by applyUrl (prefer stored version)
  const mergedOpportunities = useMemo(() => {
    const storedUrls = new Set(opportunities.map((o) => o.applyUrl));
    const dedupedLive = liveResults.filter((lr) => !storedUrls.has(lr.applyUrl));
    // Live results first, then stored
    return [...dedupedLive, ...opportunities];
  }, [opportunities, liveResults]);

  const sortedOpportunities = useMemo(() => {
    const list = liveResults.length > 0 ? mergedOpportunities : opportunities;
    const sortBy = filters.sortBy || 'deadline';
    const sorted = [...list];

    const dateValue = (value: string | null) => {
      if (!value) return Number.MAX_SAFE_INTEGER;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
    };

    if (sortBy === 'quality') {
      sorted.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
    } else if (sortBy === 'eventDate') {
      sorted.sort((a, b) => dateValue(a.eventDate) - dateValue(b.eventDate));
    } else {
      sorted.sort((a, b) => dateValue(a.cfpDeadline) - dateValue(b.cfpDeadline));
    }

    return sorted;
  }, [liveResults.length, mergedOpportunities, opportunities, filters.sortBy]);

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

      {liveResults.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            Showing {mergedOpportunities.length} results
            {liveResults.length > 0 && (
              <span className="ml-1">
                ({liveResults.filter((lr) => !opportunities.some((o) => o.applyUrl === lr.applyUrl)).length} from live search)
              </span>
            )}
          </p>
          <button
            onClick={() => setLiveResults([])}
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
        {lastUpdated && !isStale && !liveResults.length && (
          <p className="text-xs text-gray-400 mb-2">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
        <OpportunityList
          opportunities={sortedOpportunities}
          isLoading={isLoading}
        />
      </div>

      {totalPages > 1 && (
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
