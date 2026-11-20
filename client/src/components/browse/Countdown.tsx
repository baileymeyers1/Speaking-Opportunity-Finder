import type { Opportunity } from '../../types';
import { describeDeadline } from '../../lib/dates';
import { countdownText, type CallState } from '../../lib/callState';
import { NO_CALL_DETAIL } from '../../lib/callStanding';
import { LOW_CONFIDENCE_HINT } from '../../utils/verification';
import { LeadFigure } from './LeadFigure';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
      return [NO_CALL_DETAIL];
    case 'closed':
      return [];
  }
}

/**
 * Days left to apply, as a row's leading figure, or the word that stands in
 * for it ("Open", "No call"). Red is for a deadline within a week that was
 * read off the page; an inferred one is marked "~" and stays ink.
 */
export function Countdown({ opportunity, state }: CountdownProps) {
  const { figure, unit } = countdownText(state);
  const lines = explanation(opportunity, state);
  const tone =
    state.kind === 'closing' && state.urgent
      ? 'urgent'
      : state.kind === 'watch' || state.kind === 'closed'
        ? 'quiet'
        : undefined;

  if (lines.length === 0) return <LeadFigure figure={figure} unit={unit} tone={tone} />;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <LeadFigure figure={figure} unit={unit} tone={tone} className="cursor-help" />
      </TooltipTrigger>
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
