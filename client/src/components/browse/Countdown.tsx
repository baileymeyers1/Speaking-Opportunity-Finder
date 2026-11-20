import type { Opportunity } from '../../types';
import { describeDeadline } from '../../lib/dates';
import { countdownText, type CallState } from '../../lib/callState';
import { LOW_CONFIDENCE_HINT } from '../../utils/verification';
import { NO_OPEN_CALL_HINT } from '../DeadlineBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CountdownProps {
  opportunity: Pick<Opportunity, 'cfpDeadline' | 'deadlineTimezone'>;
  state: CallState;
}

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** What hovering the figure explains: the exact closing time, or why there is no count. */
function explanation(opportunity: CountdownProps['opportunity'], state: CallState): string[] {
  switch (state.kind) {
    case 'closing': {
      const closes = describeDeadline(opportunity);
      return [closes ? sentence(closes) : null, state.approximate ? LOW_CONFIDENCE_HINT : null].filter(
        (line): line is string => line !== null
      );
    }
    case 'open':
      return [
        state.until
          ? 'The page states no deadline. The call stays open until the event starts.'
          : 'The page states no deadline and no event date: this call is open all year.',
      ];
    case 'watch':
      return [NO_OPEN_CALL_HINT];
    case 'closed':
      return [];
  }
}

/**
 * What a row leads with: days left as a figure over its unit, or the word
 * that stands in for it ("Open", "No call"). Red is for a deadline within a
 * week that was read off the page; an inferred one is marked "~" and stays ink.
 */
export function Countdown({ opportunity, state }: CountdownProps) {
  const { figure, unit } = countdownText(state);
  const lines = explanation(opportunity, state);
  const isCount = state.kind === 'closing' && state.daysLeft > 0;

  const cell = (
    <div className={cn('relative z-[1] flex flex-col items-start leading-none', lines.length > 0 && 'cursor-help')}>
      <span
        className={cn(
          'tabular-nums',
          isCount ? 'text-[28px] font-light tracking-[-0.04em]' : 'text-[17px] font-normal tracking-[-0.02em]',
          state.kind === 'closing' && state.urgent && 'text-primary',
          (state.kind === 'watch' || state.kind === 'closed') && 'text-muted-foreground'
        )}
      >
        {figure}
      </span>
      {unit && <span className="mt-1.5 text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
  if (lines.length === 0) return cell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {lines.map((line, index) => (
          <p key={line} className={index > 0 ? 'mt-1' : undefined}>
            {line}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
