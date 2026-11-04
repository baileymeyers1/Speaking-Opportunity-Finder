import { Link } from 'react-router-dom';
import type { EventEdition, Opportunity } from '../types';
import { formatDate } from '../lib/dates';
import { alsoListedOnText, previousEditionHint, sourceLabel } from '../lib/eventHints';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { CalendarClock, Layers } from 'lucide-react';

/**
 * Hints that come from the canonical event behind a row: the other sources
 * that list the same call, when last year's call appeared, and the list of
 * editions on the detail page. Same shape as `VerificationHints.tsx`.
 */

type HintOpportunity = Pick<Opportunity, 'id' | 'editionYear' | 'alsoListedOn' | 'previousEditions'>;

/** "Also on WikiCFP, Pretalx" as a metadata line; nothing when no other source lists the call. */
export function AlsoListedOn({ opportunity }: { opportunity: Pick<Opportunity, 'alsoListedOn'> }) {
  const text = alsoListedOnText(opportunity.alsoListedOn);
  if (!text) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-muted-foreground cursor-default">
          <Layers className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{text}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>This call appears on several sources. They are shown as one listing; the detail page lists each one.</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** "Last year's CFP opened around 12 Mar" as a metadata line; nothing without an earlier edition. */
export function PreviousEditionHint({ opportunity }: { opportunity: Pick<Opportunity, 'editionYear' | 'previousEditions'> }) {
  const hint = previousEditionHint(opportunity);
  if (!hint) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-muted-foreground cursor-default">
          <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{hint.text}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{hint.detail}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Both hints, for the card's metadata grid. */
export function EventHintLines({ opportunity }: { opportunity: HintOpportunity }) {
  return (
    <>
      <AlsoListedOn opportunity={opportunity} />
      <PreviousEditionHint opportunity={opportunity} />
    </>
  );
}

function editionStatus(edition: EventEdition<string>, now: Date): 'open' | 'closed' | 'no deadline' {
  if (edition.isClosed) return 'closed';
  if (!edition.cfpDeadline) return 'no deadline';
  return new Date(edition.cfpDeadline).getTime() >= now.getTime() ? 'open' : 'closed';
}

/**
 * Every stored edition of the event, newest year first, with the current row
 * marked. Renders nothing when the event has only this one row.
 */
export function EventEditionsList({
  currentId,
  editions,
  now = new Date(),
}: {
  currentId: string;
  editions: EventEdition<string>[] | undefined;
  now?: Date;
}) {
  if (!editions || editions.length < 2) return null;
  return (
    <section className="space-y-3" aria-labelledby="event-editions-heading">
      <h2 id="event-editions-heading" className="text-base font-semibold text-foreground">
        Editions and sources
      </h2>
      <p className="text-sm text-muted-foreground">
        The same event, as each source and year listed it. Earlier years show when the call usually opens and closes.
      </p>
      <ul className="divide-y rounded-md border">
        {editions.map((edition) => {
          const isCurrent = edition.id === currentId;
          const status = editionStatus(edition, now);
          return (
            <li key={edition.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="w-12 shrink-0 font-medium tabular-nums text-foreground">{edition.year ?? '—'}</span>
              <span className="min-w-0 flex-1 truncate">
                {isCurrent ? (
                  <span className="text-foreground">{edition.title}</span>
                ) : (
                  <Link to={`/opportunities/${edition.id}`} className="text-primary hover:underline">
                    {edition.title}
                  </Link>
                )}
                <span className="text-muted-foreground"> · {sourceLabel(edition.source)}</span>
              </span>
              <span className="text-muted-foreground">
                {edition.cfpDeadline ? `CFP closes ${formatDate(edition.cfpDeadline)}` : 'No deadline listed'}
              </span>
              <Badge variant={status === 'open' ? 'default' : 'outline'} className="capitalize">
                {isCurrent ? 'this listing' : status}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
