import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AttentionItem } from './attention';

/**
 * Everything that needs an admin's attention, in one strip at the top.
 * Red items first; each links to the section with the detail.
 */
export function AttentionStrip({ items, isPending }: { items: AttentionItem[]; isPending: boolean }) {
  if (isPending && items.length === 0) {
    return (
      <section aria-label="Needs attention" className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Checking sources and pipeline…
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section
        aria-label="Needs attention"
        className="flex items-center gap-2 rounded-lg border border-good/40 bg-good/[0.07] p-4 text-sm text-foreground"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-good" aria-hidden="true" />
        <span>
          <span className="font-medium">All clear.</span> Every source produced rows on its last run and the pipeline is
          current.
        </span>
      </section>
    );
  }

  const critical = items.filter((item) => item.severity === 'critical').length;
  const warnings = items.length - critical;
  const summary = [
    critical > 0 ? `${critical} critical` : null,
    warnings > 0 ? `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section
      aria-label="Needs attention"
      className={cn(
        'rounded-lg border p-4',
        critical > 0
          ? 'border-critical/40 bg-critical/[0.06]'
          : 'border-warning/40 bg-warning/[0.07]'
      )}
    >
      <h2 className="text-sm font-medium text-foreground">Needs attention: {summary}</h2>
      <ul className="mt-2 space-y-2">
        {items.map((item) => {
          const Icon = item.severity === 'critical' ? XCircle : AlertTriangle;
          return (
            <li key={item.id} data-severity={item.severity} className="flex items-start gap-2 text-sm">
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  item.severity === 'critical' ? 'text-critical' : 'text-warning'
                )}
                aria-hidden="true"
              />
              <div>
                <a href={`#${item.section}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                  <span className="sr-only">{item.severity === 'critical' ? 'Critical: ' : 'Warning: '}</span>
                  {item.title}
                </a>
                <p className="text-muted-foreground">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
