import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { OpportunityFilters } from '../../types';
import { buildActiveFilterPills } from '../../filters/activeFilterPills';

interface ActiveFilterPillsProps {
  filters: OpportunityFilters;
  onFiltersChange: (filters: OpportunityFilters) => void;
}

export function ActiveFilterPills({ filters, onFiltersChange }: ActiveFilterPillsProps) {
  const pills = buildActiveFilterPills(filters);
  if (pills.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2 mt-3 list-none p-0" aria-label="Active filters">
      {pills.map((pill, index) => (
        <li key={`${pill.label}-${index}`}>
          <Badge variant="secondary" className="gap-1 pr-1">
            {pill.label}
            <button
              type="button"
              onClick={() => onFiltersChange(pill.next)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
              aria-label={`Remove ${pill.label} filter`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
