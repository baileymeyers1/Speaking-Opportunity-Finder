import { Bookmark, BookmarkCheck } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SAVE_CATEGORIES } from '../lib/opportunityDisplay';
import type { SavedCategory } from '../types';

interface SaveOpportunitySelectProps {
  savedCategory: SavedCategory | null;
  isSaving: boolean;
  onSave: (category: SavedCategory) => void;
}

/** The detail page's save control: a category picker that turns into a "Saved as" chip. */
export function SaveOpportunitySelect({ savedCategory, isSaving, onSave }: SaveOpportunitySelectProps) {
  if (savedCategory) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-md border">
        <BookmarkCheck className="h-4 w-4 text-good" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground capitalize">Saved as {savedCategory}</span>
      </div>
    );
  }
  return (
    <Select onValueChange={(value) => onSave(value as SavedCategory)} disabled={isSaving}>
      <SelectTrigger className={cn('w-[160px]', isSaving && 'opacity-50 cursor-not-allowed')} aria-label="Save to">
        <Bookmark className="h-4 w-4 mr-2" />
        <SelectValue placeholder="Save to..." />
      </SelectTrigger>
      <SelectContent>
        {SAVE_CATEGORIES.map((category) => (
          <SelectItem key={category.value} value={category.value}>
            {category.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
