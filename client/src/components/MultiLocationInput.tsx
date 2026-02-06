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
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200"
            >
              <span>{item}</span>
              <button
                onClick={() => removeChip(item)}
                className="hover:text-blue-900"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-1">
        Type a location and press Enter or comma to add multiple.
      </p>
    </div>
  );
}
