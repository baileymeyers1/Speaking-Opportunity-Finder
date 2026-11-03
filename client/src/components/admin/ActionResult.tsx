import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActionState =
  | { kind: 'idle' }
  | { kind: 'running'; message: string }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string };

/** Outcome of a manual action, announced to screen readers as it changes. */
export function ActionResult({ state }: { state: ActionState }) {
  const Icon = state.kind === 'running' ? Loader2 : state.kind === 'failed' ? XCircle : CheckCircle2;
  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'flex min-h-5 items-start gap-1.5 text-sm',
        state.kind === 'failed' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {state.kind !== 'idle' && (
        <>
          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', state.kind === 'running' && 'animate-spin')} aria-hidden="true" />
          <span>{state.message}</span>
        </>
      )}
    </p>
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
