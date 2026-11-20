import { Link } from 'react-router-dom';
import type { EventEdition } from '../types';
import { formatDate, formatDeadline } from '../lib/dates';
import { sourceLabel } from '../lib/eventHints';

/** What the canonical event behind a call adds to its page: the other listings and earlier years of the same event. */

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
