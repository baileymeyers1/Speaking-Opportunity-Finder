import { OpportunityCard } from './OpportunityCard';
import type { Opportunity } from '../types';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { SearchX } from 'lucide-react';

interface OpportunityListProps {
  opportunities: Opportunity[];
  isLoading: boolean;
  onClearFilters?: () => void;
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-8 w-20" />
      </CardFooter>
    </Card>
  );
}

export function OpportunityList({
  opportunities,
  isLoading,
  onClearFilters,
}: OpportunityListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <SearchX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No opportunities found
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Try adjusting your filters or searching for something else
        </p>
        {onClearFilters && (
          <Button
            variant="outline"
            className="mt-4"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {opportunities.map((opportunity) => (
        <OpportunityCard
          key={opportunity.id}
          opportunity={opportunity}
        />
      ))}
    </div>
  );
}
