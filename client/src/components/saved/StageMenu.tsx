import { Check, ChevronDown, Trash2 } from 'lucide-react';
import type { SavedCategory, SpeakerProfile } from '../../types';
import { NOBODY_LABEL } from '../../lib/forWhom';
import { SAVED_STAGES, STAGE_LABELS } from '../../lib/savedStage';
import { speakerName } from '../../lib/speakerDisplay';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  /** The roster, when it has more than one speaker: the menu then also says who the call is for. */
  speakers?: readonly SpeakerProfile[];
  /** Who the call is saved for; null for nobody yet. */
  speakerId?: string | null;
  /** Everyone this call is already saved for (this row included): it cannot be given to them again. */
  takenBy?: ReadonlyArray<string | null>;
  onGive?: (speakerId: string | null) => void;
}

/**
 * Where a saved call is in the pipeline, as a button on its row: it names the
 * stage, moves the call to another one, gives it to another speaker, or takes
 * it off the list. Always there, not only on hover, so touch and keyboard
 * reach it too.
 */
export function StageMenu({ title, stage, isBusy, onMove, onRemove, speakers = [], speakerId = null, takenBy = [], onGive }: StageMenuProps) {
  const people: Array<{ id: string | null; name: string }> = [
    ...speakers.map((speaker) => ({ id: speaker.id, name: speakerName(speaker) })),
    { id: null, name: NOBODY_LABEL },
  ];

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
        {onGive && speakers.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>For</DropdownMenuLabel>
            {people.map((person) => {
              const isCurrent = person.id === speakerId;
              // Someone who already has this call saved keeps their own row and stage.
              const hasItAlready = !isCurrent && takenBy.includes(person.id);
              return (
                <DropdownMenuItem
                  key={person.id ?? 'nobody'}
                  disabled={hasItAlready}
                  onClick={() => !isCurrent && onGive(person.id)}
                  className="cursor-pointer gap-3"
                >
                  <span className="min-w-0 truncate">{person.name}</span>
                  {isCurrent && <Check className="ml-auto text-muted-foreground" aria-label="Saved for them" />}
                  {hasItAlready && <span className="ml-auto text-xs text-muted-foreground">Has it saved</span>}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRemove} className="cursor-pointer text-critical focus:text-critical">
          <Trash2 aria-hidden="true" />
          Remove from saved
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
