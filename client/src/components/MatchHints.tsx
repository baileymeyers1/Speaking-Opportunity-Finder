import { Check, Sparkles, X } from 'lucide-react';
import type { Opportunity } from '../types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type MatchFields = Pick<Opportunity, 'matchScore' | 'matchReasons' | 'matchMisses'>;

export function hasMatchScore(opportunity: MatchFields): opportunity is MatchFields & { matchScore: number } {
  return typeof opportunity.matchScore === 'number';
}

function matchTone(score: number): string {
  if (score >= 70) return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
  if (score >= 40) return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300';
  return 'border-border bg-muted text-muted-foreground';
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
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
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
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            matchTone(score)
          )}
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {score}% match
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-2 text-sm font-semibold">{score}% match with your profile</p>
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
        <h2 id="why-this-matches" className="text-base font-semibold text-foreground">Why this matches</h2>
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', matchTone(score))}>
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {score}% match
        </span>
      </div>
      <MatchList opportunity={opportunity} />
    </section>
  );
}
