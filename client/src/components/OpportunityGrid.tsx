import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OpportunityList } from './OpportunityList';
import type { Opportunity } from '../types';

interface OpportunityGridProps {
  opportunities: Opportunity[];
  isLoading: boolean;
  /** Active location filter; when set, matching rows render above the rest. */
  locations?: string[];
  onClearFilters: () => void;
  page: number;
  totalPages: number;
  showPagination: boolean;
  onPageChange: (page: number) => void;
}

export function OpportunityGrid({
  opportunities,
  isLoading,
  locations,
  onClearFilters,
  page,
  totalPages,
  showPagination,
  onPageChange,
}: OpportunityGridProps) {
  const hasLocationFilter = Boolean(locations && locations.length > 0);
  const locationMatched = hasLocationFilter
    ? opportunities.filter((item) => item.matchesLocationFilter)
    : opportunities;
  const otherResults = hasLocationFilter
    ? opportunities.filter((item) => !item.matchesLocationFilter)
    : [];

  return (
    <>
      {locationMatched.length > 0 ? (
        <OpportunityList opportunities={locationMatched} isLoading={isLoading} onClearFilters={onClearFilters} />
      ) : hasLocationFilter && !isLoading ? (
        <p className="text-sm text-muted-foreground py-4">No results found in {locations!.join(', ')}</p>
      ) : (
        <OpportunityList opportunities={[]} isLoading={isLoading} onClearFilters={onClearFilters} />
      )}

      {otherResults.length > 0 && !isLoading && (
        <>
          <div className="flex items-center gap-3 pt-6 pb-2">
            <div className="h-px flex-1 bg-border" />
            <p className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              More Speaking Opportunities
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <OpportunityList opportunities={otherResults} isLoading={false} />
        </>
      )}

      {showPagination && totalPages > 1 && !isLoading && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
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
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            aria-label="Go to next page"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </>
  );
}
