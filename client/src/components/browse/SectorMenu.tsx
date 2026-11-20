import { ChevronDown } from 'lucide-react';
import { useFilterOptions } from '../../hooks/useFilterOptions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SectorMenuProps {
  selected: readonly string[];
  /** Called with the complete next selection. */
  onChange: (sectors: string[]) => void;
}

/**
 * Sectors, one click from the list: a button that opens the whole fixed list
 * with how many listed calls each sector has. The button carries the number
 * chosen; the chosen sectors themselves show as removable tags under the tools.
 */
export function SectorMenu({ selected, onChange }: SectorMenuProps) {
  const { data } = useFilterOptions();
  const sectors = data?.sectors ?? [];
  const chosen = new Set(selected);
  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const alphabetical = [...sectors].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={sectors.length === 0}>
          Sectors
          {selected.length > 0 && (
            <Badge variant="default" className="h-5 min-w-5 justify-center px-1 text-[11px] tabular-nums">
              {selected.length}
            </Badge>
          )}
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,34rem)] p-3">
        <ul className="grid max-h-[60vh] grid-cols-1 gap-x-4 overflow-y-auto sm:grid-cols-2" aria-label="Sectors">
          {alphabetical.map((sector) => {
            const pressed = chosen.has(sector.id);
            return (
              <li key={sector.id}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => toggle(sector.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-hover hover:bg-accent',
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
  );
}
