import type { Lane, SortBy } from '../../types';
import { DEFAULT_SORT } from '../../filters/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SortSelectProps {
  value: SortBy | undefined;
  /** Only the closing lane has deadlines to sort by. */
  lane: Lane;
  /** True when the signed-in user has a speaker profile, which "Best match" needs. */
  matchSortAvailable: boolean;
  onChange: (sortBy: SortBy) => void;
}

/** The list's order, as words with a chevron at the end of the lane row. */
export function SortSelect({ value, lane, matchSortAvailable, onChange }: SortSelectProps) {
  // Outside the closing lane nothing has a deadline, so the default order is by event date and says so.
  const hasDeadlines = lane === 'closing';
  const shown = !hasDeadlines && value === 'eventDate' ? DEFAULT_SORT : value || DEFAULT_SORT;

  return (
    <Select value={shown} onValueChange={(next) => onChange(next as SortBy)}>
      <SelectTrigger
        aria-label="Sort by"
        className="h-8 w-auto gap-1.5 border-transparent bg-transparent px-2 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="deadline">{hasDeadlines ? 'Deadline (soonest)' : 'Event date (soonest)'}</SelectItem>
        {hasDeadlines && <SelectItem value="eventDate">Event date (soonest)</SelectItem>}
        <SelectItem value="quality">Quality (highest)</SelectItem>
        {(matchSortAvailable || value === 'match') && (
          <SelectItem value="match" disabled={!matchSortAvailable}>
            Best match
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
