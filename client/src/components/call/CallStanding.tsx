import { ExternalLink } from 'lucide-react';
import type { Opportunity, SavedCategory, SavedOpportunity } from '../../types';
import { callState, countdownText } from '../../lib/callState';
import { callStanding } from '../../lib/callStanding';
import { SaveOpportunityMenu } from '../SaveOpportunityMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CallStandingProps {
  opportunity: Opportunity;
  /** The rows this call is saved under: one per speaker it is saved for, and one for nobody. */
  savedRows: SavedOpportunity[];
  isSaving: boolean;
  onSave: (category: SavedCategory, speakerId: string | null) => void;
}

/**
 * The call page's one row of action: where the call stands (the same
 * days-left figure a Browse row leads with), exactly when it closes, and the
 * two things to do about it. "Apply" is the page's one red button; an event
 * with no call gets a quiet link to its page instead.
 */
export function CallStanding({ opportunity, savedRows, isSaving, onSave }: CallStandingProps) {
  const state = callState(opportunity);
  const { figure, unit } = countdownText(state);
  const standing = callStanding(opportunity);
  const hasCall = state.kind !== 'watch';
  const isCount = state.kind === 'closing' && state.daysLeft > 0;

  return (
    <section
      aria-label="When this call closes"
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6 gap-y-4 border-y border-input py-5 md:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <div className="flex min-w-[4.5rem] flex-col leading-none">
        <span
          className={cn(
            'tabular-nums',
            isCount ? 'text-[40px] font-light tracking-[-0.04em]' : 'text-[22px] font-normal tracking-[-0.02em]',
            state.kind === 'closing' && state.urgent && 'text-primary',
            (state.kind === 'watch' || state.kind === 'closed') && 'text-muted-foreground'
          )}
        >
          {figure}
        </span>
        {unit && <span className="mt-2 text-xs text-muted-foreground">{unit}</span>}
      </div>

      <div className="min-w-0 text-sm leading-relaxed">
        <p className="text-foreground">{standing.lead}</p>
        {standing.detail && <p className="max-w-[60ch] text-muted-foreground">{standing.detail}</p>}
        {standing.notes.map((note) => (
          <p key={note} className="max-w-[60ch] text-[13px] text-muted-foreground">
            {note}
          </p>
        ))}
      </div>

      <div className="col-span-full flex flex-wrap items-center gap-2 md:col-span-1 md:justify-end">
        <SaveOpportunityMenu opportunity={opportunity} savedRows={savedRows} isSaving={isSaving} onSave={onSave} withLabel />
        <Button variant={hasCall ? 'default' : 'outline'} asChild>
          <a
            href={opportunity.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={hasCall ? `Apply to ${opportunity.title}` : `View the event page of ${opportunity.title}`}
          >
            {hasCall ? 'Apply' : 'View event'}
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>
  );
}
