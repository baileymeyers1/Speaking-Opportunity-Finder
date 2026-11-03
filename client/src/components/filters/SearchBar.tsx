import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
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
        className="pl-10"
        autoComplete="off"
      />
    </div>
  );
}
