import { AlertTriangle, Archive, CheckCircle2, CircleDashed, Hand, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AdminRunStatus, AdminSourceStatus } from '../../types';

/**
 * Status is always an icon plus a word, never a colour alone. The word stays in
 * secondary ink and the colour goes on the icon (the JCI Intelligence tag).
 */

export const STATUS_TONES = {
  good: 'text-muted-foreground [&_svg]:text-good',
  warning: 'text-muted-foreground [&_svg]:text-warning',
  critical: 'border-critical/35 text-critical',
  neutral: 'text-muted-foreground',
} as const;

type Tone = keyof typeof STATUS_TONES;

const SOURCE_STATUS: Record<AdminSourceStatus, { label: string; tone: Tone; icon: typeof CheckCircle2 }> = {
  healthy: { label: 'Healthy', tone: 'good', icon: CheckCircle2 },
  warning: { label: 'Warning', tone: 'warning', icon: AlertTriangle },
  failing: { label: 'Failing', tone: 'critical', icon: XCircle },
  'never-run': { label: 'Never run', tone: 'neutral', icon: CircleDashed },
  retired: { label: 'Retired', tone: 'neutral', icon: Archive },
  manual: { label: 'Manual', tone: 'neutral', icon: Hand },
};

export function SourceStatusBadge({ status, className }: { status: AdminSourceStatus; className?: string }) {
  const { label, tone, icon: Icon } = SOURCE_STATUS[status];
  return (
    <Badge variant="outline" className={cn('gap-1 whitespace-nowrap font-medium', STATUS_TONES[tone], className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}

const RUN_STATUS: Record<AdminRunStatus, { label: string; tone: Tone; icon: typeof CheckCircle2 }> = {
  ok: { label: 'OK', tone: 'good', icon: CheckCircle2 },
  error: { label: 'Error', tone: 'critical', icon: XCircle },
  running: { label: 'Running', tone: 'neutral', icon: Loader2 },
};

export function RunStatusBadge({ status, found }: { status: AdminRunStatus; found: number }) {
  // A successful run that found nothing is the signal a source has died.
  const empty = status === 'ok' && found === 0;
  const { label, tone, icon: Icon } = empty ? { label: 'OK, 0 rows', tone: 'warning' as Tone, icon: AlertTriangle } : RUN_STATUS[status];
  return (
    <Badge variant="outline" className={cn('gap-1 whitespace-nowrap font-medium', STATUS_TONES[tone])}>
      <Icon className={cn('h-3.5 w-3.5', status === 'running' && 'animate-spin')} aria-hidden="true" />
      {label}
    </Badge>
  );
}
