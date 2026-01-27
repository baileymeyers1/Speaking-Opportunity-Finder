import { useState, useEffect, useCallback } from 'react';
import { FilterPanel } from '../components/FilterPanel';
import { OpportunityList } from '../components/OpportunityList';
import { apiClient } from '../api/client';
import type { Opportunity, OpportunityFilters, PaginatedResponse, LiveSearchResult } from '../types';

export function Home() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [liveResults, setLiveResults] = useState<LiveSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [filters, setFilters] = useState<OpportunityFilters>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchOpportunities = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (filters.search) params.set('search', filters.search);
      if (filters.isRemote) params.set('isRemote', 'true');
      if (filters.compensationMin) params.set('compensationMin', String(filters.compensationMin));
      if (filters.compensationMax) params.set('compensationMax', String(filters.compensationMax));

      // Handle multiple locations
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
      }
    } catch (error) {
      console.error('Failed to fetch opportunities:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleFiltersChange = (newFilters: OpportunityFilters) => {
    setFilters(newFilters);
    setPage(1);
    setLiveResults([]); // Clear live results when filters change
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

      const response = await apiClient.get<LiveSearchResult[]>(
        `/opportunities/live-search?${params.toString()}`
      );

      if (response.data) {
        setLiveResults(response.data);
      }
    } catch (error) {
      console.error('Failed to perform live search:', error);
    } finally {
      setIsSearching(false);
    }
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

      {/* Live Search Results */}
      {liveResults.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Live Search Results ({liveResults.length})
            </h2>
            <button
              onClick={() => setLiveResults([])}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear live results
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {liveResults.map((result, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-green-50 to-white rounded-lg shadow p-6 border border-green-200"
              >
                <div className="flex justify-between items-start mb-2">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-semibold text-gray-900 hover:text-green-600"
                  >
                    {result.title}
                  </a>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Live
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{result.organization}</p>
                <p className="text-gray-700 text-sm mb-4 line-clamp-3">
                  {result.description}
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Source: {result.source}</span>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 hover:text-green-800 font-medium text-sm"
                  >
                    View &rarr;
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stored Opportunities */}
      <div>
        {liveResults.length > 0 && (
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Stored Opportunities ({opportunities.length})
          </h2>
        )}
        <OpportunityList opportunities={opportunities} isLoading={isLoading} />
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
