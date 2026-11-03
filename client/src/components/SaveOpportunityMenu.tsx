import { Bookmark, BookmarkCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { SAVE_CATEGORIES } from '../lib/opportunityDisplay';
import type { SavedCategory } from '../types';

interface SaveOpportunityMenuProps {
  savedCategory: SavedCategory | '';
  isSaving: boolean;
  onSave: (category: SavedCategory) => void;
}

export function SaveOpportunityMenu({ savedCategory, isSaving, onSave }: SaveOpportunityMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isSaving}
          className={cn('h-8 px-2', savedCategory && 'text-primary')}
        >
          {savedCategory ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          <span className="sr-only">
            {savedCategory ? `Saved as ${savedCategory}` : 'Save opportunity'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Save to...</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SAVE_CATEGORIES.map((category) => (
          <DropdownMenuItem
            key={category.value}
            onClick={() => onSave(category.value)}
            className={cn('cursor-pointer', savedCategory === category.value && 'font-semibold text-primary')}
          >
            {category.label}
            {savedCategory === category.value && (
              <span className="ml-auto text-xs text-primary">Saved</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
