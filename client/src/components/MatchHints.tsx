import { Check, Sparkles, X } from 'lucide-react';
import type { Opportunity } from '../types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type MatchFields = Pick<Opportunity, 'matchScore' | 'matchReasons' | 'matchMisses'>;

export function hasMatchScore(opportunity: MatchFields): opportunity is MatchFields & { matchScore: number } {
  return typeof opportunity.matchScore === 'number';
}

function matchTone(score: number): string {
  if (score >= 70) return 'border-border text-foreground [&_svg]:text-good';
  if (score >= 40) return 'border-border text-foreground [&_svg]:text-warning';
  return 'border-border text-muted-foreground';
}

function MatchList({ opportunity }: { opportunity: MatchFields }) {
  const reasons = opportunity.matchReasons ?? [];
  const misses = opportunity.matchMisses ?? [];
  if (reasons.length === 0 && misses.length === 0) {
    return <p className="text-sm text-muted-foreground">Your profile has nothing to compare yet, so this is the listing's quality score.</p>;
  }
  return (
    <div className="space-y-3">
      {reasons.length > 0 && (
        <ul className="space-y-1" aria-label="Why it matches">
          {reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-good" aria-hidden="true" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      {misses.length > 0 && (
        <ul className="space-y-1" aria-label="What does not fit">
          {misses.map((miss) => (
            <li key={miss} className="flex items-start gap-2 text-sm text-muted-foreground">
              <X className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" aria-hidden="true" />
              <span>{miss}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "87% match" on a card; opens a popover listing the reasons and misses. Renders nothing without a score. */
export function MatchPill({ opportunity }: { opportunity: MatchFields }) {
  if (!hasMatchScore(opportunity)) return null;
  const score = opportunity.matchScore;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${score}% match with your profile, see why`}
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium tabular-nums',
            matchTone(score)
          )}
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {score}% match
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-2 text-sm font-medium">{score}% match with your profile</p>
        <MatchList opportunity={opportunity} />
      </PopoverContent>
    </Popover>
  );
}

/** The "Why this matches" block on the detail page. Renders nothing without a score. */
export function MatchExplanationBlock({ opportunity }: { opportunity: MatchFields }) {
  if (!hasMatchScore(opportunity)) return null;
  const score = opportunity.matchScore;
  return (
    <section aria-labelledby="why-this-matches" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="why-this-matches" className="text-base font-medium text-foreground">Why this matches</h2>
        <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium tabular-nums', matchTone(score))}>
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {score}% match
        </span>
      </div>
      <MatchList opportunity={opportunity} />
    </section>
  );
}
