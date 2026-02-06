import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import type {
  OpportunityFilters,
  OpportunityFormat,
  CompensationType,
  FilterOptions,
} from '../types';

interface FilterPanelProps {
  filters: OpportunityFilters;
  onFiltersChange: (filters: OpportunityFilters) => void;
  onLiveSearch?: () => void;
  isSearching?: boolean;
}

const defaultFormats: OpportunityFormat[] = [
  'conference',
  'meetup',
  'podcast',
  'webinar',
  'workshop',
  'panel',
  'other',
];

const defaultCompensationTypes: CompensationType[] = [
  'paid',
  'travel',
  'exposure',
  'honorarium',
];

const COMPENSATION_MAX = 2000;

export function FilterPanel({
  filters,
  onFiltersChange,
  onLiveSearch,
  isSearching = false
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const response = await apiClient.get<FilterOptions>('/opportunities/filters');
        if (response.data) {
          setFilterOptions(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch filter options:', error);
      }
    };

    fetchFilterOptions();
  }, []);

  const formats = filterOptions?.formats || defaultFormats;
  const compensationTypes = filterOptions?.compensationTypes || defaultCompensationTypes;
  const locations = filterOptions?.locations || [];
  const industries = filterOptions?.industries || [];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, search: e.target.value || undefined });
  };

  const handleFormatChange = (format: OpportunityFormat) => {
    const currentFormats = filters.format || [];
    const newFormats = currentFormats.includes(format)
      ? currentFormats.filter((f) => f !== format)
      : [...currentFormats, format];
    onFiltersChange({
      ...filters,
      format: newFormats.length > 0 ? newFormats : undefined,
    });
  };

  const handleCompensationTypeChange = (type: CompensationType) => {
    const currentTypes = filters.compensationType || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
    onFiltersChange({
      ...filters,
      compensationType: newTypes.length > 0 ? newTypes : undefined,
    });
  };

  const handleRemoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({
      ...filters,
      isRemote: e.target.checked ? true : undefined,
    });
  };

  const handleCompensationMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    onFiltersChange({
      ...filters,
      compensationMin: value > 0 ? value : undefined,
    });
  };

  const handleCompensationMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    onFiltersChange({
      ...filters,
      compensationMax: value < COMPENSATION_MAX ? value : undefined,
    });
  };

  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const selectedLocations = filters.locations || [];

  const activeFilterCount = [
    filters.format?.length,
    filters.industries?.length,
    filters.compensationType?.length,
    filters.isRemote,
    selectedLocations.length,
    filters.compensationMin,
    filters.compensationMax,
  ].filter(Boolean).length;

  const formatCompensationValue = (value: number, isMax: boolean) => {
    if (isMax && value >= COMPENSATION_MAX) {
      return '$2,000+';
    }
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="Search opportunities..."
          value={filters.search || ''}
          onChange={handleSearchChange}
          className="flex-1 rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-600 hover:text-gray-900 px-4 py-2 border border-gray-300 rounded-md flex items-center gap-2"
        >
          {isExpanded ? 'Hide Filters' : 'Filters'}
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
        {onLiveSearch && (
          <button
            onClick={onLiveSearch}
            disabled={isSearching}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSearching ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Searching...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Live Search
              </>
            )}
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-6 pt-4 border-t">
          {/* Location Filter - Dropdown */}
          <div className="flex flex-wrap gap-6 items-start">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Location</h3>
              <MultiSelectDropdown
                label="Locations"
                options={locations}
                selected={selectedLocations}
                onChange={(sel) =>
                  onFiltersChange({ ...filters, locations: sel.length > 0 ? sel : undefined })
                }
                placeholder="Search locations..."
              />
              <label className="inline-flex items-center mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.isRemote || false}
                  onChange={handleRemoteChange}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span className="ml-2 text-sm text-gray-700 font-medium">Remote only</span>
              </label>
            </div>

            {/* Industry Filter - Dropdown */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Industry</h3>
              <MultiSelectDropdown
                label="Industries"
                options={industries}
                selected={filters.industries || []}
                onChange={(sel) =>
                  onFiltersChange({ ...filters, industries: sel.length > 0 ? sel : undefined })
                }
                placeholder="Search industries..."
              />
            </div>
          </div>

          {/* Format Filter */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Format</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {formats.map((format) => (
                <label key={format} className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.format?.includes(format) || false}
                    onChange={() => handleFormatChange(format)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span className="ml-2 text-sm text-gray-600 capitalize">
                    {format}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Compensation Type Filter */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Compensation Type
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {compensationTypes.map((type) => (
                <label key={type} className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.compensationType?.includes(type) || false}
                    onChange={() => handleCompensationTypeChange(type)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span className="ml-2 text-sm text-gray-600 capitalize">
                    {type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Compensation Amount Range */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Compensation Amount (USD)
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Min:</span>
                <input
                  type="range"
                  min={0}
                  max={COMPENSATION_MAX}
                  step={100}
                  value={filters.compensationMin || 0}
                  onChange={handleCompensationMinChange}
                  className="w-32"
                />
                <span className="text-sm text-gray-600 w-20">
                  {formatCompensationValue(filters.compensationMin || 0, false)}
                </span>
              </div>
              <span className="text-gray-400">to</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Max:</span>
                <input
                  type="range"
                  min={0}
                  max={COMPENSATION_MAX}
                  step={100}
                  value={filters.compensationMax || COMPENSATION_MAX}
                  onChange={handleCompensationMaxChange}
                  className="w-32"
                />
                <span className="text-sm text-gray-600 w-20">
                  {formatCompensationValue(filters.compensationMax || COMPENSATION_MAX, true)}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Slide max to $2,000+ to include all higher amounts
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleClearFilters}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear all filters
            </button>
            {activeFilterCount > 0 && (
              <span className="text-sm text-gray-500">
                {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
