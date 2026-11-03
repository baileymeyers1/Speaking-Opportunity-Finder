import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCount } from './formatters';

/** One number with a label and an optional note underneath; a `tone` marks it as needing attention. */
export function StatTile({
  label,
  value,
  note,
  tone = 'neutral',
  children,
}: {
  label: string;
  value: number | string;
  note?: ReactNode;
  tone?: 'neutral' | 'warning' | 'critical';
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-md border bg-muted/30 p-3',
        tone === 'warning' && 'border-amber-600/50 bg-amber-50/60 dark:bg-amber-950/30',
        tone === 'critical' && 'border-red-600/50 bg-red-50/60 dark:bg-red-950/30'
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
        {typeof value === 'number' ? formatCount(value) : value}
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      {children}
    </div>
  );
}

/** A labelled list of counts, used for breakdowns like industries and formats. */
export function CountList({ items, emptyText }: { items: Array<{ label: string; count: number }>; emptyText: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate capitalize text-foreground">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatCount(item.count)}</span>
          </div>
          <div className="mt-0.5 h-1 rounded-full bg-muted" aria-hidden="true">
            <div className="h-1 rounded-full bg-primary/60" style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
