import { useState } from 'react';
import { SlidersHorizontal, Zap, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { SearchBar } from './filters/SearchBar';
import { ActiveFilterPills } from './filters/ActiveFilterPills';
import { AdvancedFilters } from './filters/AdvancedFilters';
import { useSearchDraft } from './filters/useSearchDraft';
import { canLiveSearch, countActiveFilters } from '../filters/serialize';
import { DEFAULT_SORT } from '../filters/constants';
import type { OpportunityFilters, SortBy } from '../types';

interface FilterPanelProps {
  filters: OpportunityFilters;
  /** Called with the complete next filter set; the parent writes it to the URL. */
  onFiltersChange: (filters: OpportunityFilters) => void;
  /** Called with the effective filters, including any search text not yet committed. */
  onLiveSearch?: (filters: OpportunityFilters) => void;
  isSearching?: boolean;
}

export function FilterPanel({
  filters,
  onFiltersChange,
  onLiveSearch,
  isSearching = false,
}: FilterPanelProps) {
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
  const liveSearchDisabled = isSearching || !canLiveSearch({ ...filters, search: search.draft });

  return (
    <Card className="p-4 mb-6">
      <SearchBar value={search.draft} onChange={search.update} onSubmit={search.flush} />

      <ActiveFilterPills filters={filters} onFiltersChange={onFiltersChange} />

      {/* Second row: Sort + Live Search + Filter count + Filters toggle + Clear */}
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Sort</span>
          <Select
            value={filters.sortBy || DEFAULT_SORT}
            onValueChange={(value) => onFiltersChange({ ...filters, sortBy: value as SortBy })}
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
          <Button onClick={handleLiveSearch} disabled={liveSearchDisabled} size="sm" className="gap-1.5">
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
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <AdvancedFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        onClearFilters={handleClearFilters}
        isExpanded={isExpanded}
        activeFilterCount={activeFilterCount}
      />
    </Card>
  );
}
