import { Check, Sparkles, X } from 'lucide-react';
import type { Opportunity } from '../types';
import { useForWhom } from '../hooks/useForWhom';
import { EVERYONE, namedFits } from '../lib/forWhom';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type MatchFields = Pick<Opportunity, 'matchScore' | 'matchReasons' | 'matchMisses'>;
type FitFields = MatchFields & Pick<Opportunity, 'matchSpeakerId' | 'speakerFits'>;

export function hasMatchScore<Fields extends MatchFields>(opportunity: Fields): opportunity is Fields & { matchScore: number } {
  return typeof opportunity.matchScore === 'number';
}

function matchTone(score: number): string {
  if (score >= 70) return 'border-border text-foreground [&_svg]:text-good';
  if (score >= 40) return 'border-border text-foreground [&_svg]:text-warning';
  return 'border-border text-muted-foreground';
}

/** The reasons a call fits a speaker and the ways it does not, as two short lists. */
export function MatchList({ opportunity }: { opportunity: Pick<MatchFields, 'matchReasons' | 'matchMisses'> }) {
  const reasons = opportunity.matchReasons ?? [];
  const misses = opportunity.matchMisses ?? [];
  if (reasons.length === 0 && misses.length === 0) {
    return <p className="text-sm text-muted-foreground">The profile has nothing to compare yet, so this is the listing's quality score.</p>;
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

/**
 * How well a call fits, on its row: "87% match", or with everyone chosen on a
 * roster of several, the speaker it fits best ("Dana Okafor 87%"). It opens
 * the reasons, and how the rest of the roster scores. Renders nothing without
 * a score.
 */
export function MatchPill({ opportunity }: { opportunity: FitFields }) {
  const { choice, speakers, canChoose } = useForWhom();
  if (!hasMatchScore(opportunity)) return null;

  const score = opportunity.matchScore;
  const fits = namedFits(opportunity.speakerFits, speakers);
  const whose = fits.find((fit) => fit.speakerId === opportunity.matchSpeakerId)?.name;
  // With one speaker chosen every row would repeat their name; with everyone, the name is the news.
  const names = canChoose && choice === EVERYONE && whose;
  const others = canChoose ? fits.filter((fit) => fit.speakerId !== opportunity.matchSpeakerId) : [];
  const heading = whose ? `${score}% match for ${whose}` : `${score}% match`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${heading}, see why`}
          className={cn(
            'inline-flex h-6 max-w-[11rem] items-center gap-1.5 rounded-sm border px-2 text-xs font-medium tabular-nums',
            matchTone(score)
          )}
        >
          <Sparkles className="h-3 w-3 flex-none" aria-hidden="true" />
          {names ? (
            <>
              <span className="min-w-0 truncate">{whose}</span>
              <span className="flex-none">{score}%</span>
            </>
          ) : (
            `${score}% match`
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-2 text-sm font-medium">{heading}</p>
        <MatchList opportunity={opportunity} />
        {others.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-3 text-sm text-muted-foreground" aria-label="The rest of the roster">
            {others.map((fit) => (
              <li key={fit.speakerId} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{fit.name}</span>
                <span className="flex-none tabular-nums">{fit.score}%</span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
