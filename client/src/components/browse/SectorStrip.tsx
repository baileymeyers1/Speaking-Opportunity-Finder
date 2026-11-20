import { ChevronDown } from 'lucide-react';
import { useFilterOptions } from '../../hooks/useFilterOptions';
import type { SectorOption } from '../../types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** How many sectors sit on the strip itself; the rest are one more click away. */
const ON_STRIP = 7;

interface SectorStripProps {
  selected: readonly string[];
  /** Called with the complete next selection. */
  onChange: (sectors: string[]) => void;
}

function SectorToggle({ sector, pressed, onToggle }: { sector: SectorOption; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'inline-flex h-7 flex-none items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 text-[13px] transition-colors duration-state ease-out',
        pressed
          ? 'border-transparent bg-foreground text-background'
          : 'border-border text-muted-foreground hover:border-input hover:text-foreground'
      )}
    >
      {sector.label}
      <span className={cn('tabular-nums', pressed ? 'text-background/70' : 'text-faint')}>{sector.count.toLocaleString('en-US')}</span>
    </button>
  );
}

/**
 * Sectors one click away: the busiest ones as toggles with their counts (every
 * listed call, whichever lane), any chosen one always among them, and the rest
 * of the fixed list behind "More".
 */
export function SectorStrip({ selected, onChange }: SectorStripProps) {
  const { data } = useFilterOptions();
  const sectors = data?.sectors ?? [];
  if (sectors.length === 0) return null;

  const chosen = new Set(selected);
  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  const busiest = sectors
    .filter((sector) => sector.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, ON_STRIP);
  const onStrip = new Set(busiest.map((sector) => sector.id));
  // A chosen sector that is not among the busiest still shows, so the strip never hides what is filtering the list.
  const shown = [...busiest, ...sectors.filter((sector) => chosen.has(sector.id) && !onStrip.has(sector.id))];
  const alphabetical = [...sectors].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <section aria-label="Sectors" className="flex items-center gap-2">
      <div className="-mx-5 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-5 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {shown.map((sector) => (
          <SectorToggle key={sector.id} sector={sector} pressed={chosen.has(sector.id)} onToggle={() => toggle(sector.id)} />
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 flex-none items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-[13px] text-foreground underline decoration-[var(--rule-2)] decoration-1 underline-offset-4 transition-colors hover:decoration-current"
            >
              All {sectors.length} sectors
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(92vw,34rem)] p-3">
            <ul className="grid max-h-[60vh] grid-cols-1 gap-x-4 overflow-y-auto sm:grid-cols-2" aria-label="All sectors">
              {alphabetical.map((sector) => {
                const pressed = chosen.has(sector.id);
                return (
                  <li key={sector.id}>
                    <button
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => toggle(sector.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                        pressed ? 'font-medium text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn('h-2 w-2 flex-none rounded-[2px] border', pressed ? 'border-transparent bg-foreground' : 'border-input')}
                        />
                        {sector.label}
                      </span>
                      <span className="tabular-nums text-faint">{sector.count.toLocaleString('en-US')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}
