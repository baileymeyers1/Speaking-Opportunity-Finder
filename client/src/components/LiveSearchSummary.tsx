import { ExternalLink, Hourglass } from 'lucide-react';
import type { PendingLiveHit } from '@/types';

interface LiveSearchSummaryProps {
  /** Pages the live search found after its relevance filter. */
  foundCount: number;
  /** Of those, how many were read and are not open calls for speakers. */
  notOpenCount: number;
  /** Pages found but not read yet. */
  pendingHits: PendingLiveHit[];
  /** Set when background checks have spent today's limit: when they resume (ISO). */
  backgroundChecksResumeAt: string | null;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * What the live search did with the pages it found: how many turned out not
 * to be open calls, and which ones it has not read yet (by name, unchecked).
 * Explains a short result list instead of leaving it looking broken.
 */
function backgroundNote(resumeAt: string | null): string {
  if (!resumeAt) return 'The rest are checked in the background within a few minutes.';
  const time = new Date(resumeAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Background checks have used today's limit and resume at ${time}.`;
}

export function LiveSearchSummary({ foundCount, notOpenCount, pendingHits, backgroundChecksResumeAt }: LiveSearchSummaryProps) {
  if (foundCount === 0 && pendingHits.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground" role="status" aria-live="polite">
      {foundCount > 0 && (
        <p>
          Live search found {foundCount} {foundCount === 1 ? 'page' : 'pages'}
          {notOpenCount > 0 && (
            <>
              ; {notOpenCount} {notOpenCount === 1 ? "wasn't an open call" : "weren't open calls"} for speakers
              (articles, vendor pages or events without a speaker call)
            </>
          )}
          .
        </p>
      )}

      {pendingHits.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground">
            <Hourglass className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {pendingHits.length} not checked yet
            <span className="font-normal text-muted-foreground group-open:hidden">(show)</span>
          </summary>
          <p className="mt-2">
            We have not read these pages yet, so they may not be open calls. Each live search reads up to 8 of them
            right away. {backgroundNote(backgroundChecksResumeAt)}
          </p>
          <ul className="mt-2 space-y-1">
            {pendingHits.map((hit) => (
              <li key={hit.applyUrl} className="flex min-w-0 items-baseline gap-2">
                <a
                  href={hit.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-baseline gap-1 text-foreground underline-offset-2 hover:underline"
                >
                  <span className="truncate">{hit.title}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0 self-center" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                <span className="flex-shrink-0 text-xs">{hostname(hit.applyUrl)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
