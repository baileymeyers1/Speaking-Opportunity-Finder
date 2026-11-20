import { Link } from 'react-router-dom';
import type { EventEdition, Opportunity } from '../types';
import { formatDate, formatDeadline } from '../lib/dates';
import { alsoListedOnText, previousEditionHint, sourceLabel } from '../lib/eventHints';
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
    <section aria-labelledby="event-editions-heading">
      <h2 id="event-editions-heading" className="heading text-foreground">
        Other listings and earlier years
      </h2>
      <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
        The same event, as each source and year listed it. Earlier years show when the call usually closes.
      </p>
      <ul className="mt-3 divide-y border-y">
        {editions.map((edition) => {
          const isCurrent = edition.id === currentId;
          const status = editionStatus(edition, now);
          // The day in the deadline's own zone, as the row itself shows it; a UTC date reads a day late for "end of day, anywhere on Earth".
          const closingDay = formatDeadline(edition)?.date ?? formatDate(edition.cfpDeadline);
          const closes = closingDay ? `${status === 'closed' ? 'Closed' : 'Closes'} ${closingDay}` : 'No deadline listed';
          return (
            <li
              key={edition.id}
              className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
            >
              <span className="tabular-nums text-muted-foreground">{edition.year ?? ''}</span>
              <span className="min-w-0">
                {isCurrent ? (
                  <span className="text-foreground">{edition.title}</span>
                ) : (
                  <Link to={`/opportunities/${edition.id}`} className="link">
                    {edition.title}
                  </Link>
                )}
                <span className="ml-2 text-[13px] text-muted-foreground">
                  {isCurrent ? 'This listing' : sourceLabel(edition.source)}
                </span>
              </span>
              <span className="col-start-2 text-[13px] tabular-nums text-muted-foreground sm:col-start-auto">{closes}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
