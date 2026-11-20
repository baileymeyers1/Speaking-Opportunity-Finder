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
  /** Shows the word beside the bookmark ("Save", then "Saved as applied"): the call page has room for it, a row does not. */
  withLabel?: boolean;
}

export function SaveOpportunityMenu({ savedCategory, isSaving, onSave, withLabel = false }: SaveOpportunityMenuProps) {
  const Icon = savedCategory ? BookmarkCheck : Bookmark;
  const label = savedCategory ? `Saved as ${savedCategory}` : 'Save';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {withLabel ? (
          <Button variant="outline" disabled={isSaving}>
            <Icon className={cn(savedCategory && 'text-good')} aria-hidden="true" />
            {label}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={isSaving} className={cn('h-8 px-2', savedCategory && 'text-primary')}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{savedCategory ? label : 'Save opportunity'}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Save to...</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SAVE_CATEGORIES.map((category) => (
          <DropdownMenuItem
            key={category.value}
            onClick={() => onSave(category.value)}
            className={cn('cursor-pointer', savedCategory === category.value && 'font-medium text-primary')}
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
