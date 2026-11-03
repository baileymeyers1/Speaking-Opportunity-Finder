import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminPipelineEvent } from '../../types';
import { formatRelative } from './formatters';

const KIND_LABEL: Record<AdminPipelineEvent['kind'], string> = {
  'scraper-run': 'Scrape',
  enrichment: 'Enrich',
  verification: 'Verify',
};

/** The last few things the pipeline did, newest first. */
export function PipelineEvents({ events, now }: { events: AdminPipelineEvent[]; now: Date }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has run yet.</p>;
  }
  return (
    <ol className="divide-y rounded-md border" aria-label="Recent pipeline events">
      {events.map((event) => {
        const Icon = event.status === 'error' ? XCircle : CheckCircle2;
        return (
          <li key={`${event.at}-${event.summary}`} className="flex items-start gap-2 px-3 py-2 text-sm">
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                event.status === 'error' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-foreground">
                <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {KIND_LABEL[event.kind]}
                </span>
                {event.summary}
                <span className="sr-only">{event.status === 'error' ? ', failed' : ''}</span>
              </p>
              {event.detail && <p className="truncate text-xs text-muted-foreground" title={event.detail}>{event.detail}</p>}
            </div>
            <time dateTime={event.at} className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatRelative(event.at, now)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
