import { Bookmark, BookmarkCheck, Check } from 'lucide-react';
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
import { useForWhom } from '../hooks/useForWhom';
import { NOBODY_LABEL, saveTarget, savedForLabel, speakersByFit } from '../lib/forWhom';
import { DEFAULT_STAGE, SAVED_STAGES, STAGE_LABELS } from '../lib/savedStage';
import { speakerName } from '../lib/speakerDisplay';
import type { Opportunity, SavedCategory, SavedOpportunity } from '../types';

interface SaveOpportunityMenuProps {
  opportunity: Pick<Opportunity, 'speakerFits'>;
  /** The rows the call is already saved under: one per speaker, and one for nobody. */
  savedRows: readonly SavedOpportunity[];
  isSaving: boolean;
  onSave: (category: SavedCategory, speakerId: string | null) => void;
  /** Shows the word beside the bookmark ("Save", then "Saved as applied"): the call page has room for it, a row does not. */
  withLabel?: boolean;
}

/**
 * The bookmark on a call. When it is plain who the call would be saved for
 * (a speaker is chosen, or the roster has one speaker or none) it lists the
 * stages. With everyone chosen on a roster of several it asks who: the
 * speakers, best fit first, and "no one yet".
 */
export function SaveOpportunityMenu({ opportunity, savedRows, isSaving, onSave, withLabel = false }: SaveOpportunityMenuProps) {
  const { choice, speakers } = useForWhom();
  const target = saveTarget(choice, speakers);
  const asks = target === 'ask';
  const stageOf = (speakerId: string | null) => savedRows.find((row) => row.speakerId === speakerId)?.category;

  const savedStage = asks ? undefined : stageOf(target.speakerId);
  const isSaved = asks ? savedRows.length > 0 : Boolean(savedStage);
  const label = !isSaved
    ? 'Save'
    : asks
      ? `Saved for ${savedRows.map((row) => savedForLabel(row.speakerId, speakers)).join(', ')}`
      : `Saved as ${savedStage}`;
  const Icon = isSaved ? BookmarkCheck : Bookmark;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {withLabel ? (
          <Button variant="outline" disabled={isSaving} className="max-w-full">
            <Icon className={cn(isSaved && 'text-good')} aria-hidden="true" />
            <span className="min-w-0 truncate">{label}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={isSaving} className={cn('h-8 px-2', isSaved && 'text-primary')}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{isSaved ? label : 'Save opportunity'}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {asks ? (
          <>
            <DropdownMenuLabel>Save for</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {speakersByFit(speakers, opportunity.speakerFits).map(({ speaker, score }) => (
              <SaveForItem
                key={speaker.id}
                name={speakerName(speaker)}
                detail={score === null ? null : `${score}%`}
                stage={stageOf(speaker.id)}
                onSave={() => onSave(DEFAULT_STAGE, speaker.id)}
              />
            ))}
            <DropdownMenuSeparator />
            <SaveForItem name={NOBODY_LABEL} detail={null} stage={stageOf(null)} onSave={() => onSave(DEFAULT_STAGE, null)} />
          </>
        ) : (
          <>
            <DropdownMenuLabel>
              {target.speakerId && speakers.length > 1 ? `Save for ${savedForLabel(target.speakerId, speakers)}` : 'Save to...'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SAVED_STAGES.map((stage) => (
              <DropdownMenuItem
                key={stage}
                onClick={() => onSave(stage, target.speakerId)}
                className={cn('cursor-pointer', savedStage === stage && 'font-medium')}
              >
                {STAGE_LABELS[stage]}
                {savedStage === stage && <span className="ml-auto text-xs text-muted-foreground">Saved</span>}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SaveForItemProps {
  name: string;
  /** The speaker's fit with the call, when it is known. */
  detail: string | null;
  /** The stage the call is already saved under for them; such a row is moved on the Saved page, not saved again. */
  stage: SavedCategory | undefined;
  onSave: () => void;
}

function SaveForItem({ name, detail, stage, onSave }: SaveForItemProps) {
  return (
    <DropdownMenuItem onClick={onSave} disabled={Boolean(stage)} className="cursor-pointer gap-3">
      <span className="min-w-0 truncate">{name}</span>
      <span className="ml-auto inline-flex flex-none items-center gap-1 text-xs tabular-nums text-muted-foreground">
        {stage ? (
          <>
            <Check className="size-3.5" aria-hidden="true" />
            {STAGE_LABELS[stage]}
          </>
        ) : (
          detail
        )}
      </span>
    </DropdownMenuItem>
  );
}
