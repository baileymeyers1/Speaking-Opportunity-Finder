import { useState, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  X,
  Zap,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { MultiLocationInput } from './MultiLocationInput';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
  isSearching = false,
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  useEffect(() => {
    const CACHE_KEY = 'filter_options_cache';
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setFilterOptions(data);
          return;
        }
      } catch { /* invalid cache, refetch */ }
    }

    const fetchFilters = async () => {
      try {
        const response = await apiClient.get<FilterOptions>('/opportunities/filters');
        if (response.success && response.data) {
          setFilterOptions(response.data);
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: response.data,
            timestamp: Date.now(),
          }));
        }
      } catch (error) {
        console.error('Failed to fetch filter options:', error);
      }
    };
    fetchFilters();
  }, []);

  const formats = filterOptions?.formats || defaultFormats;
  const compensationTypes = filterOptions?.compensationTypes || defaultCompensationTypes;
  const hasCompensation = filterOptions?.compensationStats?.hasCompensation ?? true;
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
    filters.qualityMin,
  ].filter(Boolean).length;

  const formatCompensationValue = (value: number, isMax: boolean) => {
    if (isMax && value >= COMPENSATION_MAX) {
      return '$2,000+';
    }
    return `$${value.toLocaleString()}`;
  };

  const formatQualityValue = (value: number) => `${value}+`;

  // Build active filter pills for display
  const activeFilterPills: { label: string; onRemove: () => void }[] = [];

  if (filters.format?.length) {
    filters.format.forEach((f) => {
      activeFilterPills.push({
        label: f.charAt(0).toUpperCase() + f.slice(1),
        onRemove: () => handleFormatChange(f),
      });
    });
  }

  if (filters.industries?.length) {
    filters.industries.forEach((ind) => {
      activeFilterPills.push({
        label: ind.charAt(0).toUpperCase() + ind.slice(1),
        onRemove: () => {
          const next = (filters.industries || []).filter((i) => i !== ind);
          onFiltersChange({
            ...filters,
            industries: next.length > 0 ? next : undefined,
          });
        },
      });
    });
  }

  if (filters.isRemote) {
    activeFilterPills.push({
      label: 'Remote',
      onRemove: () => onFiltersChange({ ...filters, isRemote: undefined }),
    });
  }

  if (selectedLocations.length) {
    selectedLocations.forEach((loc) => {
      activeFilterPills.push({
        label: loc,
        onRemove: () => {
          const next = selectedLocations.filter((l) => l !== loc);
          onFiltersChange({
            ...filters,
            locations: next.length > 0 ? next : undefined,
          });
        },
      });
    });
  }

  if (filters.compensationType?.length) {
    filters.compensationType.forEach((ct) => {
      activeFilterPills.push({
        label: ct.charAt(0).toUpperCase() + ct.slice(1),
        onRemove: () => handleCompensationTypeChange(ct),
      });
    });
  }

  if (filters.compensationMin) {
    activeFilterPills.push({
      label: `Min ${formatCompensationValue(filters.compensationMin, false)}`,
      onRemove: () => onFiltersChange({ ...filters, compensationMin: undefined }),
    });
  }

  if (filters.compensationMax && filters.compensationMax < COMPENSATION_MAX) {
    activeFilterPills.push({
      label: `Max ${formatCompensationValue(filters.compensationMax, true)}`,
      onRemove: () => onFiltersChange({ ...filters, compensationMax: undefined }),
    });
  }

  if (filters.qualityMin) {
    activeFilterPills.push({
      label: `Quality ${filters.qualityMin}+`,
      onRemove: () => onFiltersChange({ ...filters, qualityMin: undefined }),
    });
  }

  const liveSearchDisabled = isSearching || (!filters.search && !filters.industries?.length);

  return (
    <Card className="p-4 mb-6">
      {/* Top row: Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="opportunity-search" className="sr-only">Search opportunities</label>
        <Input
          type="text"
          id="opportunity-search"
          placeholder="Search opportunities..."
          value={filters.search || ''}
          onChange={handleSearchChange}
          className="pl-10"
        />
      </div>

      {/* Active filter pills */}
      {activeFilterPills.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {activeFilterPills.map((pill, idx) => (
            <Badge
              key={`${pill.label}-${idx}`}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {pill.label}
              <button
                onClick={pill.onRemove}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                aria-label={`Remove ${pill.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Second row: Sort + Live Search + Filter count + Filters toggle + Clear */}
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Sort</span>
          <Select
            value={filters.sortBy || 'deadline'}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                sortBy: value as 'quality' | 'deadline' | 'eventDate',
              })
            }
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deadline">Deadline (soonest)</SelectItem>
              <SelectItem value="eventDate">Event date (soonest)</SelectItem>
              <SelectItem value="quality">Quality (highest)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {onLiveSearch && (
          <Button
            onClick={onLiveSearch}
            disabled={liveSearchDisabled}
            size="sm"
            className="gap-1.5"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Live Search
              </>
            )}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Button
              variant="link"
              size="sm"
              onClick={handleClearFilters}
              className="text-muted-foreground hover:text-foreground px-1 h-auto"
            >
              Clear all
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls="advanced-filters"
            className="gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="default" className="ml-1 h-5 w-5 p-0 justify-center text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Expandable advanced filters section */}
      <div
        id="advanced-filters"
        role="region"
        aria-label="Advanced filters"
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <Separator className="mb-4" />

          <div className="space-y-6">
            {/* Location + Industry row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Location Filter */}
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">Location</h3>
                <MultiLocationInput
                  label="Locations"
                  selected={selectedLocations}
                  onChange={(sel) =>
                    onFiltersChange({ ...filters, locations: sel.length > 0 ? sel : undefined })
                  }
                  placeholder="Add locations (e.g., Los Angeles, CA)"
                />
                <label className="inline-flex items-center mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.isRemote || false}
                    onChange={handleRemoteChange}
                    className="rounded border-input text-primary focus:ring-ring h-4 w-4"
                  />
                  <span className="ml-2 text-sm text-foreground font-medium">Remote only</span>
                </label>
              </div>

              {/* Industry Filter */}
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">Industry</h3>
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
              <h3 className="text-sm font-medium text-foreground mb-2">Format</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {formats.map((format) => (
                  <label key={format} className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.format?.includes(format) || false}
                      onChange={() => handleFormatChange(format)}
                      className="rounded border-input text-primary focus:ring-ring h-4 w-4"
                    />
                    <span className="ml-2 text-sm text-muted-foreground capitalize">
                      {format}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Compensation Type Filter */}
            {hasCompensation && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">
                  Compensation Type
                </h3>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {compensationTypes.map((type) => (
                    <label key={type} className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.compensationType?.includes(type) || false}
                        onChange={() => handleCompensationTypeChange(type)}
                        className="rounded border-input text-primary focus:ring-ring h-4 w-4"
                      />
                      <span className="ml-2 text-sm text-muted-foreground capitalize">
                        {type}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Compensation Amount Range */}
            {hasCompensation && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">
                  Compensation Amount (USD)
                </h3>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Min:</span>
                    <input
                      type="range"
                      min={0}
                      max={COMPENSATION_MAX}
                      step={100}
                      value={filters.compensationMin || 0}
                      onChange={handleCompensationMinChange}
                      aria-label="Minimum compensation amount"
                      className="w-32 accent-primary"
                    />
                    <span className="text-sm text-muted-foreground w-20">
                      {formatCompensationValue(filters.compensationMin || 0, false)}
                    </span>
                  </div>
                  <span className="text-muted-foreground">to</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Max:</span>
                    <input
                      type="range"
                      min={0}
                      max={COMPENSATION_MAX}
                      step={100}
                      value={filters.compensationMax || COMPENSATION_MAX}
                      onChange={handleCompensationMaxChange}
                      aria-label="Maximum compensation amount"
                      className="w-32 accent-primary"
                    />
                    <span className="text-sm text-muted-foreground w-20">
                      {formatCompensationValue(filters.compensationMax || COMPENSATION_MAX, true)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Slide max to $2,000+ to include all higher amounts
                </p>
              </div>
            )}

            {/* Quality Score Filter */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">
                Minimum Quality Score
              </h3>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={filters.qualityMin ?? 0}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    onFiltersChange({
                      ...filters,
                      qualityMin: value > 0 ? value : undefined,
                    });
                  }}
                  aria-label="Minimum quality score"
                  className="w-48 accent-primary"
                />
                <span className="text-sm text-muted-foreground w-16">
                  {formatQualityValue(filters.qualityMin ?? 0)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Filters out lower-confidence results (0 shows all)
              </p>
            </div>

            {/* Clear all footer */}
            <div className="flex items-center gap-4">
              <Button
                variant="link"
                size="sm"
                onClick={handleClearFilters}
                className="px-0 h-auto text-primary"
              >
                Clear all filters
              </Button>
              {activeFilterCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
