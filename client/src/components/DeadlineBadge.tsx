import type { Opportunity } from '../types';
import { describeDeadline } from '../lib/dates';
import { getDeadlineBadge } from '../lib/opportunityDisplay';
import { approximate, isLowConfidence, LOW_CONFIDENCE_HINT } from '../utils/verification';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface DeadlineBadgeProps {
  opportunity: Pick<Opportunity, 'cfpDeadline' | 'deadlineTimezone' | 'dateConfidence'>;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The card's deadline pill ("3d left", "Closed", "Nov 30, 2026"). Hovering
 * shows when the call closes in its own zone and on the viewer's clock, and
 * the low-confidence hint when the extraction was unsure about the date.
 */
export function DeadlineBadge({ opportunity }: DeadlineBadgeProps) {
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
