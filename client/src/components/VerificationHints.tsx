import type { ReactNode } from 'react';
import type { Opportunity } from '../types';
import { formatDate, formatDeadline } from '../lib/dates';
import { approximate, isLowConfidence, LOW_CONFIDENCE_HINT } from '../utils/verification';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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
