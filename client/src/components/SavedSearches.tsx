import { useState, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Bookmark, Trash2, Save } from 'lucide-react';
import { apiClient } from '../api/client';
import type { SavedSearch } from '../types';

interface SavedSearchesProps {
  currentQuery: string;
  currentFilters: Record<string, unknown>;
  onApplySearch: (query: string, filters: Record<string, unknown>) => void;
}

export function SavedSearches({ currentQuery, currentFilters, onApplySearch }: SavedSearchesProps) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchSearches = useCallback(async () => {
    try {
      const response = await apiClient.get<SavedSearch[]>('/saved-searches');
      if (response.data) {
        setSearches(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch saved searches:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSearches();
    }
  }, [isOpen, fetchSearches]);

  const handleSave = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setIsSaving(true);
    try {
      await apiClient.post('/saved-searches', {
        name: trimmed,
        query: currentQuery || null,
        filters: currentFilters,
      });
      setNewName('');
      await fetchSearches();
    } catch (err) {
      console.error('Failed to save search:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/saved-searches/${id}`);
      setSearches((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete saved search:', err);
    }
  };

  const handleApply = (search: SavedSearch) => {
    const filters = JSON.parse(search.filters) as Record<string, unknown>;
    onApplySearch(search.query || '', filters);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Bookmark className="h-4 w-4" />
          Saved Searches
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3">
          <h4 className="text-sm font-medium">Saved Searches</h4>
        </div>
        <Separator />

        {/* List */}
        <div className="max-h-60 overflow-y-auto">
          {searches.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              No saved searches yet
            </p>
          ) : (
            <ul className="py-1">
              {searches.map((search) => (
                <li
                  key={search.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted/50"
                >
                  <button
                    className="flex-1 truncate text-left text-sm hover:underline"
                    onClick={() => handleApply(search)}
                    title={search.name}
                  >
                    {search.name}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(search.id)}
                    aria-label={`Delete "${search.name}"`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator />

        {/* Save current search */}
        <div className="p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Save current search</p>
          <div className="flex gap-2">
            <Input
              placeholder="Search name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              className="h-8 gap-1 px-2.5"
              onClick={handleSave}
              disabled={!newName.trim() || isSaving}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
