import type { ReactNode } from 'react';
import type { Opportunity } from '../types';
import { formatDate } from '../lib/dates';
import { approximate, formatVerifiedAgo, isLowConfidence, LOW_CONFIDENCE_HINT } from '../utils/verification';
import { cn } from '@/lib/utils';
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
  opportunity: Pick<Opportunity, 'eventDate' | 'cfpDeadline' | 'dateConfidence'>;
  field: 'eventDate' | 'cfpDeadline';
  style?: 'short' | 'long';
  /** Shown when the opportunity has no date for this field. */
  fallback: string;
  className?: string;
}

/** The formatted date, or "~date" with a tooltip when the extraction was unsure about it. */
export function DateWithConfidence({ opportunity, field, style = 'short', fallback, className }: DateWithConfidenceProps) {
  const label = formatDate(opportunity[field], style);
  if (!label) return <span className={className}>{fallback}</span>;
  if (!isLowConfidence(opportunity, field)) return <span className={className}>{label}</span>;
  return (
    <ApproximateHint>
      <span className={cn('cursor-help underline decoration-dotted underline-offset-2', className)}>
        {approximate(label, true)}
      </span>
    </ApproximateHint>
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
