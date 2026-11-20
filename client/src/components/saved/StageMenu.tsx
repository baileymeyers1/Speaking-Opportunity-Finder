import { Check, ChevronDown, Trash2 } from 'lucide-react';
import type { SavedCategory } from '../../types';
import { SAVED_STAGES, STAGE_LABELS } from '../../lib/savedStage';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface StageMenuProps {
  /** The call's title, for the menu's accessible name. */
  title: string;
  stage: SavedCategory;
  isBusy: boolean;
  onMove: (stage: SavedCategory) => void;
  onRemove: () => void;
}

/**
 * Where a saved call is in the pipeline, as a button on its row: it names the
 * stage, moves the call to another one, or takes it off the list. Always
 * there, not only on hover, so touch and keyboard reach it too.
 */
export function StageMenu({ title, stage, isBusy, onMove, onRemove }: StageMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isBusy} aria-label={`${STAGE_LABELS[stage]}: change the stage of ${title}`}>
          {STAGE_LABELS[stage]}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {SAVED_STAGES.map((option) => (
          <DropdownMenuItem key={option} onClick={() => option !== stage && onMove(option)} className="cursor-pointer">
            {STAGE_LABELS[option]}
            {option === stage && <Check className="ml-auto text-muted-foreground" aria-label="Current stage" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRemove} className="cursor-pointer text-critical focus:text-critical">
          <Trash2 aria-hidden="true" />
          Remove from saved
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
