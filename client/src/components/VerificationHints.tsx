import type { ReactNode } from 'react';
import type { Opportunity } from '../types';
import { formatDate, formatDeadline } from '../lib/dates';
import { approximate, formatVerifiedAgo, isLowConfidence, LOW_CONFIDENCE_HINT } from '../utils/verification';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ShieldCheck } from 'lucide-react';

/** Wraps an approximate date so hovering explains why it carries a "~". */
export function ApproximateHint({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        <p>{LOW_CONFIDENCE_HINT}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface DateWithConfidenceProps {
  opportunity: Pick<Opportunity, 'eventDate' | 'cfpDeadline' | 'deadlineTimezone' | 'dateConfidence'>;
  field: 'eventDate' | 'cfpDeadline';
  style?: 'short' | 'long';
  /** Shown when the opportunity has no date for this field. */
  fallback: string;
  className?: string;
}

const ZONE_ASSUMED_NOTE = 'Timezone not stated; read as Anywhere on Earth (UTC-12).';

/**
 * The formatted date, or "~date" with a tooltip when the extraction was unsure
 * about it. An event date is a calendar day; a deadline is shown with its
 * closing time in its own zone and on the viewer's clock, and the long form
 * says when that zone was assumed.
 */
export function DateWithConfidence({ opportunity, field, style = 'short', fallback, className }: DateWithConfidenceProps) {
  const deadline = field === 'cfpDeadline' ? formatDeadline(opportunity, { style }) : null;
  const label = field === 'cfpDeadline' ? (deadline?.full ?? null) : formatDate(opportunity.eventDate, style);
  if (!label) return <span className={className}>{fallback}</span>;
  const zoneNote = deadline?.zoneAssumed && style === 'long' ? (
    <span className="block text-xs text-muted-foreground mt-0.5">{ZONE_ASSUMED_NOTE}</span>
  ) : null;
  if (!isLowConfidence(opportunity, field)) {
    return (
      <span className={className}>
        {label}
        {zoneNote}
      </span>
    );
  }
  return (
    <span className={className}>
      <ApproximateHint>
        <span className="cursor-help underline decoration-dotted underline-offset-2">{approximate(label, true)}</span>
      </ApproximateHint>
      {zoneNote}
    </span>
  );
}

interface VerifiedBadgeProps {
  opportunity: Pick<Opportunity, 'verifiedAt' | 'verificationError'>;
  /** `line` is the compact metadata row on cards; `badge` is the outline pill on the detail page. */
  variant: 'line' | 'badge';
}

/** "Verified Xd ago" with the check date in a tooltip. Renders nothing for a never-verified listing. */
export function VerifiedBadge({ opportunity, variant }: VerifiedBadgeProps) {
  const label = formatVerifiedAgo(opportunity);
  if (!label) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {variant === 'line' ? (
          <div className="flex items-center gap-1.5 text-muted-foreground cursor-default">
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </div>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 cursor-default text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700"
          >
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {label}
          </Badge>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <p>Dates and status were checked against the event page on {formatDate(opportunity.verifiedAt)}.</p>
      </TooltipContent>
    </Tooltip>
  );
}
