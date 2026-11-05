import type { Opportunity } from '../types';
import { describeDeadline } from '../lib/dates';
import { getDeadlineBadge } from '../lib/opportunityDisplay';
import { approximate, isLowConfidence, LOW_CONFIDENCE_HINT } from '../utils/verification';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface DeadlineBadgeProps {
  opportunity: Pick<Opportunity, 'cfpDeadline' | 'deadlineTimezone' | 'dateConfidence' | 'hasOpenCall'>;
}

/** Shown for an event whose page was read and asks for no speakers right now. */
export const NO_OPEN_CALL_HINT =
  'We read this event\'s page and found no call for speakers. Contact the organizer to pitch a talk, or check back: listed events are re-checked weekly.';

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The card's deadline pill ("3d left", "Closed", "Nov 30, 2026", or "No open
 * call" for an event that is not asking for speakers). Hovering
 * shows when the call closes in its own zone and on the viewer's clock, and
 * the low-confidence hint when the extraction was unsure about the date.
 */
export function DeadlineBadge({ opportunity }: DeadlineBadgeProps) {
  if (opportunity.hasOpenCall === false) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="cursor-help text-[11px] px-1.5 py-0 border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300"
          >
            No open call
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>{NO_OPEN_CALL_HINT}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const badge = getDeadlineBadge(opportunity);
  const isApproximate = !!opportunity.cfpDeadline && isLowConfidence(opportunity, 'cfpDeadline');
  const description = describeDeadline(opportunity);

  const pill = (
    <Badge
      variant={badge.variant}
      className={cn('text-[11px] px-1.5 py-0', description && 'cursor-help', badge.className)}
    >
      {approximate(badge.label, isApproximate)}
    </Badge>
  );
  if (!description) return pill;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent>
        <p>{sentence(description)}</p>
        {isApproximate && <p className="mt-1">{LOW_CONFIDENCE_HINT}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
