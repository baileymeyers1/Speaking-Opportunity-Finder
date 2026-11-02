import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { MultiSelectDropdown } from '../MultiSelectDropdown';
import { MultiLocationInput } from '../MultiLocationInput';
import { useFilterOptions } from '../../hooks/useFilterOptions';
import { COMPENSATION_MAX, COMPENSATION_TYPES, OPPORTUNITY_FORMATS } from '../../filters/constants';
import { formatCompensationValue } from '../../filters/activeFilterPills';
import type { CompensationType, OpportunityFilters, OpportunityFormat } from '../../types';

interface AdvancedFiltersProps {
  filters: OpportunityFilters;
  onFiltersChange: (filters: OpportunityFilters) => void;
  onClearFilters: () => void;
  isExpanded: boolean;
  activeFilterCount: number;
}

function toggleValue<T>(values: T[] | undefined, value: T): T[] | undefined {
  const current = values || [];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return next.length > 0 ? next : undefined;
}

const checkboxClass = 'rounded border-input text-primary focus:ring-ring h-4 w-4';

export function AdvancedFilters({
  filters,
  onFiltersChange,
  onClearFilters,
  isExpanded,
  activeFilterCount,
}: AdvancedFiltersProps) {
  const { data: filterOptions } = useFilterOptions();
  const formats = filterOptions?.formats || OPPORTUNITY_FORMATS;
  const compensationTypes = filterOptions?.compensationTypes || COMPENSATION_TYPES;
  const hasCompensation = filterOptions?.compensationStats?.hasCompensation ?? true;
  const industries = filterOptions?.industries || [];
  const selectedLocations = filters.locations || [];

  const handleFormatChange = (format: OpportunityFormat) =>
    onFiltersChange({ ...filters, format: toggleValue(filters.format, format) });

  const handleCompensationTypeChange = (type: CompensationType) =>
    onFiltersChange({ ...filters, compensationType: toggleValue(filters.compensationType, type) });

  return (
    <div
      id="advanced-filters"
      role="region"
      aria-label="Advanced filters"
      // Collapsed content is visually hidden but would otherwise stay in the tab order.
      inert={isExpanded ? undefined : ''}
      aria-hidden={!isExpanded}
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
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Location</h3>
              <MultiLocationInput
                label="Locations"
                selected={selectedLocations}
                onChange={(selected) =>
                  onFiltersChange({ ...filters, locations: selected.length > 0 ? selected : undefined })
                }
                placeholder="Add locations (e.g., Los Angeles, CA)"
              />
              <label className="inline-flex items-center mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.isRemote || false}
                  onChange={(event) =>
                    onFiltersChange({ ...filters, isRemote: event.target.checked ? true : undefined })
                  }
                  className={checkboxClass}
                />
                <span className="ml-2 text-sm text-foreground font-medium">Remote only</span>
              </label>
            </div>

            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Industry</h3>
              <MultiSelectDropdown
                label="Industries"
                options={industries}
                selected={filters.industries || []}
                onChange={(selected) =>
                  onFiltersChange({ ...filters, industries: selected.length > 0 ? selected : undefined })
                }
                placeholder="Search industries..."
              />
            </div>
          </div>

          {/* Format */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Format</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {formats.map((format) => (
                <label key={format} className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.format?.includes(format) || false}
                    onChange={() => handleFormatChange(format)}
                    className={checkboxClass}
                  />
                  <span className="ml-2 text-sm text-muted-foreground capitalize">{format}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Compensation type */}
          {hasCompensation && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Compensation Type</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {compensationTypes.map((type) => (
                  <label key={type} className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.compensationType?.includes(type) || false}
                      onChange={() => handleCompensationTypeChange(type)}
                      className={checkboxClass}
                    />
                    <span className="ml-2 text-sm text-muted-foreground capitalize">{type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Compensation amount */}
          {hasCompensation && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Compensation Amount (USD)</h3>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Min:</span>
                  <input
                    type="range"
                    min={0}
                    max={COMPENSATION_MAX}
                    step={100}
                    value={filters.compensationMin || 0}
                    onChange={(event) => {
                      const value = parseInt(event.target.value, 10);
                      onFiltersChange({ ...filters, compensationMin: value > 0 ? value : undefined });
                    }}
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
                    value={filters.compensationMax ?? COMPENSATION_MAX}
                    onChange={(event) => {
                      const value = parseInt(event.target.value, 10);
                      onFiltersChange({
                        ...filters,
                        compensationMax: value < COMPENSATION_MAX ? value : undefined,
                      });
                    }}
                    aria-label="Maximum compensation amount"
                    className="w-32 accent-primary"
                  />
                  <span className="text-sm text-muted-foreground w-20">
                    {formatCompensationValue(filters.compensationMax ?? COMPENSATION_MAX, true)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Slide max to $2,000+ to include all higher amounts
              </p>
            </div>
          )}

          {/* Quality score */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Minimum Quality Score</h3>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={filters.qualityMin ?? 0}
                onChange={(event) => {
                  const value = parseInt(event.target.value, 10);
                  onFiltersChange({ ...filters, qualityMin: value > 0 ? value : undefined });
                }}
                aria-label="Minimum quality score"
                className="w-48 accent-primary"
              />
              <span className="text-sm text-muted-foreground w-16">{filters.qualityMin ?? 0}+</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Filters out lower-confidence results (0 shows all)
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4">
            <Button variant="link" size="sm" onClick={onClearFilters} className="px-0 h-auto text-primary">
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
  );
}
