import { useState } from 'react';

interface MultiLocationInputProps {
  label: string;
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

function normalizeLocation(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function MultiLocationInput({
  label,
  selected,
  onChange,
  placeholder = 'Add locations...',
}: MultiLocationInputProps) {
  const [input, setInput] = useState('');

  const addLocations = (raw: string) => {
    const parts = raw
      .split(',')
      .map(normalizeLocation)
      .filter(Boolean);

    if (parts.length === 0) return;

    const existing = new Set(selected.map((s) => s.toLowerCase()));
    const next = [...selected];
    for (const part of parts) {
      if (!existing.has(part.toLowerCase())) {
        next.push(part);
        existing.add(part.toLowerCase());
      }
    }
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) {
        addLocations(input);
        setInput('');
      }
    }
  };

  const handleBlur = () => {
    if (input.trim()) {
      addLocations(input);
      setInput('');
    }
  };

  const removeChip = (value: string) => {
    onChange(selected.filter((s) => s !== value));
  };

  return (
    <div className="max-w-xs">
      <label htmlFor="location-input" className="block text-sm font-medium text-foreground mb-2">
        {label}
      </label>
      <input
        type="text"
        id="location-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="field w-full px-3 py-2 text-sm"
      />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-border px-2 text-xs font-medium text-muted-foreground"
            >
              <span>{item}</span>
              <button
                onClick={() => removeChip(item)}
                aria-label={`Remove ${item}`}
                className="hover:text-foreground"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        Type a location and press Enter or comma to add multiple.
      </p>
    </div>
  );
}
