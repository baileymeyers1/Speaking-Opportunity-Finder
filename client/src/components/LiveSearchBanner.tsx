import { AlertCircle, Clock, Hourglass, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LiveSearchBannerProps {
  resultCount: number;
  liveResultCount: number;
  /** New live hits stored but not checked yet; they join the results once read. */
  pendingLiveCount: number;
  /** Number of results matching the location filter, when one is active. */
  locationMatchedCount: number | null;
  lastUpdated: Date | null;
  isRefreshing: boolean;
  rateLimited: boolean;
  liveSearchFailed: boolean;
  onClearLiveResults: () => void;
  onDismissRateLimit: () => void;
  onDismissLiveError: () => void;
}

/**
 * Status row above the grid: result counts, where live results came from,
 * how many live hits are still being checked, and the two non-fatal notices (rate limit, live search failure) that keep
 * the stored results on screen.
 */
export function LiveSearchBanner({
  resultCount,
  liveResultCount,
  pendingLiveCount,
  locationMatchedCount,
  lastUpdated,
  isRefreshing,
  rateLimited,
  liveSearchFailed,
  onClearLiveResults,
  onDismissRateLimit,
  onDismissLiveError,
}: LiveSearchBannerProps) {
  return (
    <>
      {rateLimited && (
        <div
          className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
          role="status"
          aria-live="polite"
        >
          <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          Search limit reached. Showing cached results. Try again in a moment.
          <button
            type="button"
            onClick={onDismissRateLimit}
            className="ml-auto rounded-full p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
            aria-label="Dismiss rate limit warning"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {liveSearchFailed && (
        <div
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-foreground"
          role="status"
          aria-live="polite"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" aria-hidden="true" />
          Live search failed. Showing stored results only.
          <button
            type="button"
            onClick={onDismissLiveError}
            className="ml-auto rounded-full p-0.5 hover:bg-muted transition-colors"
            aria-label="Dismiss live search error"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {pendingLiveCount > 0 && (
        <div
          className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Hourglass className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {pendingLiveCount} more possible {pendingLiveCount === 1 ? 'match' : 'matches'} found. We are checking{' '}
          {pendingLiveCount === 1 ? 'its page' : 'their pages'}; open calls for speakers will show up in this search within
          the hour.
        </div>
      )}

      {resultCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <p className="text-sm text-muted-foreground">
            Showing {resultCount} result{resultCount !== 1 ? 's' : ''}
            {locationMatchedCount !== null && (
              <span className="ml-1">({locationMatchedCount} in your area)</span>
            )}
            {liveResultCount > 0 && <span className="ml-1">({liveResultCount} from live search)</span>}
          </p>
          <div className="flex items-center gap-3">
            {liveResultCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearLiveResults} className="text-muted-foreground">
                <X className="h-4 w-4" aria-hidden="true" />
                Clear live results
              </Button>
            )}
            {lastUpdated && !isRefreshing && liveResultCount === 0 && (
              <span className="text-xs text-muted-foreground">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
