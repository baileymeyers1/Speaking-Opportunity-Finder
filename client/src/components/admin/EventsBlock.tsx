import type { AdminEventStats } from '../../types';
import { formatCount } from './formatters';
import { StatTile } from './StatTile';

/** Canonical events inside the Catalogue section: totals and the pairs the matcher left for review. */
export function EventsBlock({ events }: { events: AdminEventStats }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Events</h3>
        <p className="text-xs text-muted-foreground">
          One event per conference across sources and years; the list shows one card per event. Pairs scoring between{' '}
          {events.thresholds.review} and {events.thresholds.autoLink} are kept apart and listed here for tuning.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Events"
          value={events.events}
          note={`${formatCount(events.linkedRows)} rows linked, ${formatCount(events.unlinkedRows)} without an event`}
        />
        <StatTile label="Rows per event" value={events.rowsPerEvent.toFixed(1)} note="linked rows ÷ events" />
        <StatTile label="On several sources" value={events.multiSourceEvents} note="events folded from more than one source" />
        <StatTile label="Several years" value={events.multiYearEvents} note="events with an earlier edition stored" />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-foreground">Possible duplicates</h4>
        {events.possibleDuplicates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pairs in the review band.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {events.possibleDuplicates.map((pair) => (
              <li key={pair.opportunityId} className="grid gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[3.5rem_1fr_1fr]">
                <span className="font-medium tabular-nums text-foreground">{pair.score.toFixed(2)}</span>
                <span className="min-w-0 truncate text-foreground" title={pair.title}>
                  {pair.title} <span className="text-muted-foreground">· {pair.source}</span>
                </span>
                <span className="min-w-0 truncate text-muted-foreground" title={pair.possibleEvent ?? pair.possibleEventId}>
                  looks like {pair.possibleEvent ?? pair.possibleEventId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
