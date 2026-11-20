import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** A control that sits inside the end of the box (live search, once there is something to search for). */
  action?: ReactNode;
}

export function SearchBar({ value, onChange, onSubmit, action }: SearchBarProps) {
  return (
    <div className="relative">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        aria-hidden="true"
      />
      <label htmlFor="opportunity-search" className="sr-only">
        Search opportunities
      </label>
      <Input
        type="search"
        id="opportunity-search"
        placeholder="Search opportunities..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit();
        }}
        className={cn('pl-10', action && 'pr-[7.75rem]')}
        autoComplete="off"
      />
      {action && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{action}</div>}
    </div>
  );
}
