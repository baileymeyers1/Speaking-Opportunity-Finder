import { Link, useLocation } from 'react-router-dom';
import type { LaneSummary } from '../../types';
import { situationHeadline, situationNote } from '../../lib/situation';

/**
 * What Browse opens with: one sentence saying what closes soon under the
 * filters in force, then the call that closes first. The accented phrase is
 * the page's one use of JCI's red Fraunces italic.
 */
export function SituationLine({ lanes }: { lanes: LaneSummary | undefined }) {
  const location = useLocation();
  const headline = situationHeadline(lanes);
  const note = situationNote(lanes);

  return (
    <header>
      <h1 className="display text-foreground">
        {headline.lead}
        <em className="accent-word">{headline.accent}</em>
        {headline.tail}
      </h1>
      {/* The line keeps its height while the numbers load, so the list below does not jump. */}
      <p className="mt-3 min-h-[1.55em] max-w-[68ch] text-muted-foreground" aria-live="polite">
        {note?.next && (
          <>
            <Link
              to={`/opportunities/${note.next.id}`}
              state={{ from: `${location.pathname}${location.search}` }}
              className="link"
            >
              {note.next.title}
            </Link>{' '}
            closes first, {note.next.when}.{note.rest ? ' ' : ''}
          </>
        )}
        {note?.rest}
      </p>
    </header>
  );
}
