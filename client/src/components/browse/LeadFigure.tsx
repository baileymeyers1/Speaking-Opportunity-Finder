import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface LeadFigureProps extends HTMLAttributes<HTMLDivElement> {
  /** A count ("9") or the word that stands in for one ("Today", "Open"). */
  figure: string;
  unit: string;
  /** `urgent` is the page's "look here" red; `quiet` steps back. */
  tone?: 'urgent' | 'quiet';
}

/**
 * What a call's row leads with: a figure over its unit. A number is set large
 * and light; a word is set at reading size so it does not shout.
 */
export const LeadFigure = forwardRef<HTMLDivElement, LeadFigureProps>(function LeadFigure(
  { figure, unit, tone, className, ...rest },
  ref
) {
  const isCount = /^~?\d/.test(figure);
  return (
    <div ref={ref} className={cn('relative z-[1] flex flex-col items-start leading-none', className)} {...rest}>
      <span
        className={cn(
          'tabular-nums',
          isCount ? 'text-[28px] font-light tracking-[-0.04em]' : 'text-[17px] font-normal tracking-[-0.02em]',
          tone === 'urgent' && 'text-primary',
          tone === 'quiet' && 'text-muted-foreground'
        )}
      >
        {figure}
      </span>
      {unit && <span className="mt-1.5 text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
});
