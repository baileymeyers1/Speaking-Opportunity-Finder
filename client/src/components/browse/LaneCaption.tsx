import { Loader2 } from 'lucide-react';
import type { Lane, LaneSummary } from '../../types';
import { laneCaption } from '../../lib/laneCaption';

interface LaneCaptionProps {
  lane: Lane;
  lanes: LaneSummary | undefined;
  /** True while fresh rows load behind the stored ones. */
  isRefreshing: boolean;
}

/**
 * The quiet line beside the lane switch: what closes soon, or what the lane
 * holds. While the list refreshes it says so here, so the rows never move.
 */
export function LaneCaption({ lane, lanes, isRefreshing }: LaneCaptionProps) {
  const caption = laneCaption(lane, lanes);
  if (!caption && !isRefreshing) return null;

  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status" aria-live="polite">
      {isRefreshing && <Loader2 className="h-3.5 w-3.5 flex-none animate-spin" aria-hidden="true" />}
      {caption || 'Updating'}
    </p>
  );
}
