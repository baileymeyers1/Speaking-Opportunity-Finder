import { OpportunityCard } from './OpportunityCard';
import type { Opportunity } from '../types';

interface OpportunityListProps {
  opportunities: Opportunity[];
  isLoading: boolean;
  onSaveLive?: (opportunity: Opportunity) => void;
}

export function OpportunityList({
  opportunities,
  isLoading,
  onSaveLive,
}: OpportunityListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow p-6 animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        ))}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No opportunities found</p>
        <p className="text-gray-400 mt-2">
          Try adjusting your filters or check back later
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {opportunities.map((opportunity) => (
        <OpportunityCard
          key={opportunity.id}
          opportunity={opportunity}
          onSaveLive={opportunity.isLiveResult ? onSaveLive : undefined}
        />
      ))}
    </div>
  );
}
