import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Loader2, SlidersHorizontal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchBar } from './filters/SearchBar';
import { ActiveFilterPills } from './filters/ActiveFilterPills';
import { AdvancedFilters } from './filters/AdvancedFilters';
import { useSearchDraft } from './filters/useSearchDraft';
import { SectorMenu } from './browse/SectorMenu';
import { canLiveSearch, countActiveFilters } from '../filters/serialize';
import type { OpportunityFilters } from '../types';

interface FilterPanelProps {
  filters: OpportunityFilters;
  /** Called with the complete next filter set; the parent writes it to the URL. */
  onFiltersChange: (filters: OpportunityFilters) => void;
  /** Called with the effective filters, including any search text not yet committed. */
  onLiveSearch?: (filters: OpportunityFilters) => void;
  isSearching?: boolean;
  /** Extra controls at the end of the row (saved searches, for someone signed in). */
  actions?: ReactNode;
}

/**
 * Browse's tools, on one row: the search box, sectors, the rest of the filters.
 * Live search sits inside the search box and only once there is something to
 * search for. What is filtering the list shows as removable tags underneath.
 */
export function FilterPanel({ filters, onFiltersChange, onLiveSearch, isSearching = false, actions }: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const search = useSearchDraft(filters.search ?? '', (term) =>
    onFiltersChange({ ...filters, search: term || undefined })
  );

  const handleLiveSearch = () => {
    const term = search.flush();
    onLiveSearch?.({ ...filters, search: term || undefined });
  };

  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const activeFilterCount = countActiveFilters(filters);
  // Sectors carry their own count on their own button.
  const panelFilterCount = countActiveFilters({ ...filters, sectors: undefined });
  const liveSearchReady = canLiveSearch({ ...filters, search: search.draft });

  const liveSearch =
    onLiveSearch && (liveSearchReady || isSearching) ? (
      <Button onClick={handleLiveSearch} disabled={isSearching} size="sm" className="h-7 gap-1.5 px-2.5 text-[12.5px]">
        {isSearching ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Searching...
          </>
        ) : (
          <>
            <Zap aria-hidden="true" />
            Live search
          </>
        )}
      </Button>
    ) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-64">
          <SearchBar value={search.draft} onChange={search.update} onSubmit={search.flush} action={liveSearch} />
        </div>

        <SectorMenu
          selected={filters.sectors ?? []}
          onChange={(sectors) => onFiltersChange({ ...filters, sectors: sectors.length > 0 ? sectors : undefined })}
        />

        <Button
          variant="outline"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls="advanced-filters"
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters
          {panelFilterCount > 0 && (
            <Badge variant="default" className="h-5 min-w-5 justify-center px-1 text-[11px] tabular-nums">
              {panelFilterCount}
            </Badge>
          )}
          {isExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </Button>

        {actions}
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-3">
          <ActiveFilterPills filters={filters} onFiltersChange={onFiltersChange} />
          <Button variant="link" size="sm" onClick={handleClearFilters} className="mt-3 h-auto px-1 text-muted-foreground">
            Clear all
          </Button>
        </div>
      )}

      <AdvancedFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        onClearFilters={handleClearFilters}
        isExpanded={isExpanded}
        activeFilterCount={activeFilterCount}
      />
    </div>
  );
}
