import { useState, useRef, useEffect } from 'react';

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  /** Display text for an option whose value is an id; without it the value is shown, capitalized. */
  getLabel?: (option: string) => string;
  /** A count shown beside an option, e.g. how many results it has. */
  getCount?: (option: string) => number | undefined;
}

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Search...',
  getLabel,
  getCount,
}: MultiSelectDropdownProps) {
  const labelOf = (option: string) => (getLabel ? getLabel(option) : option);
  // Free-text values arrive lowercase; a label is already written as it should read.
  const labelClass = getLabel ? '' : 'capitalize';
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Move focus into the search box when the user opens the list
  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter((opt) =>
    labelOf(opt).toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const removeChip = (option: string) => {
    onChange(selected.filter((s) => s !== option));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Select ${label}${selected.length > 0 ? `, ${selected.length} selected` : ''}`}
        className="field w-full max-w-xs flex items-center justify-between px-3 py-2 text-sm"
      >
        <span className="text-foreground">
          {label}
          {selected.length > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-foreground px-1.5 text-[11px] font-medium tabular-nums text-background">
              {selected.length}
            </span>
          )}
        </span>
        <svg
          className={`ml-2 h-4 w-4 text-faint transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full max-w-xs bg-popover text-popover-foreground border rounded-md shadow-lg">
          <div className="p-2">
            <input
              type="text"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={`Search ${label}`}
              className="field h-9 w-full px-3 py-1.5 text-sm"
              ref={searchRef}
            />
          </div>
          <div className="max-h-48 overflow-y-auto px-2 pb-2" role="listbox" aria-label={label}>
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-2 px-1">No matches</p>
            )}
            {filtered.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 px-1 py-1.5 rounded-sm hover:bg-accent cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => toggle(option)}
                  className="h-4 w-4"
                />
                <span className={`text-sm text-foreground ${labelClass}`}>{labelOf(option)}</span>
                {getCount?.(option) !== undefined && (
                  <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums">{getCount(option)}</span>
                )}
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t px-2 py-2">
              <button
                onClick={() => onChange([])}
                aria-label={`Clear all selected ${label}`}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-border px-2 text-xs font-medium text-muted-foreground"
            >
              <span className={labelClass}>{labelOf(item)}</span>
              <button
                onClick={() => removeChip(item)}
                aria-label={`Remove ${labelOf(item)}`}
                className="hover:text-foreground"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
