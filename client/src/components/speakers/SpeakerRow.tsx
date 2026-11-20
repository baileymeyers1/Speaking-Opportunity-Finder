import { Link } from 'react-router-dom';
import { ChevronRight, MapPin } from 'lucide-react';
import type { SpeakerProfile } from '../../types';
import { speakerName, speakerReach, topicsPreview } from '../../lib/speakerDisplay';
import { Badge } from '@/components/ui/badge';

/** The grid the row and its skeleton share. */
export const SPEAKER_ROW_GRID =
  '-mx-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b px-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]';

/**
 * One speaker on the roster: who they are, where they go, what they speak
 * about, and what is saved for them ("4 interested, 2 applied"). The name is
 * the row's link and covers the row, as a call's title does on Browse.
 */
export function SpeakerRow({ speaker, saved }: { speaker: SpeakerProfile; saved?: string }) {
  const { shown, more } = topicsPreview(speaker.topics);

  return (
    <li className={`${SPEAKER_ROW_GRID} relative transition-colors duration-hover ease-out hover:bg-[var(--row-hover)]`}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium leading-snug">
          <Link
            to={`/speakers/${speaker.id}`}
            className="text-foreground transition-colors duration-hover after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
          >
            {speakerName(speaker)}
          </Link>
        </h2>
        {speaker.title && <p className="mt-0.5 truncate text-sm text-muted-foreground">{speaker.title}</p>}
        <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
          <li className="inline-flex max-w-full items-center gap-1.5">
            <MapPin className="size-3.5 flex-none" aria-hidden="true" />
            <span className="min-w-0 truncate">{speakerReach(speaker)}</span>
          </li>
          {shown.map((topic) => (
            <li key={topic}>
              <Badge variant="secondary" className="h-[22px] px-1.5">
                {topic}
              </Badge>
            </li>
          ))}
          {more > 0 && <li>and {more} more</li>}
          {speaker.topics.length === 0 && <li>No topics yet: fit is scored on call quality alone</li>}
          {/* On a phone the saved calls fold into this line. */}
          {saved && <li className="sm:hidden">{saved}</li>}
        </ul>
      </div>
      {saved && <p className="hidden text-[13px] text-muted-foreground sm:block">{saved}</p>}
      <ChevronRight className="size-4 text-faint" aria-hidden="true" />
    </li>
  );
}

export function SpeakerRowSkeleton() {
  return (
    <li className={SPEAKER_ROW_GRID} aria-hidden="true">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-64 max-w-full animate-pulse rounded-sm bg-muted" />
      </div>
    </li>
  );
}
