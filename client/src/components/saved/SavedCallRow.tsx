import { User } from 'lucide-react';
import type { SavedCategory, SpeakerProfile } from '../../types';
import { callState } from '../../lib/callState';
import { savedForLabel } from '../../lib/forWhom';
import { eventCountdownText, type SavedCall } from '../../lib/savedStage';
import { ApplyLink, CallRowFrame } from '../browse/CallRow';
import { Countdown } from '../browse/Countdown';
import { LeadFigure } from '../browse/LeadFigure';
import { StageMenu } from './StageMenu';

interface SavedCallRowProps {
  saved: SavedCall;
  isBusy: boolean;
  /** The account's roster; with more than one speaker the row can be given to another. */
  speakers: readonly SpeakerProfile[];
  /** True when the list is everyone's: the row then says whose call it is. */
  showsWho: boolean;
  /** Everyone this call is saved for, across the account's saved rows. */
  takenBy: ReadonlyArray<string | null>;
  onMove: (saved: SavedCall, stage: SavedCategory) => void;
  onGive: (saved: SavedCall, speakerId: string | null) => void;
  onRemove: (saved: SavedCall) => void;
}

/**
 * A saved call: the Browse row with a stage menu in place of the save button.
 * While you are still interested it leads with the days left to apply; once
 * you have applied, with the days until the event.
 */
export function SavedCallRow({ saved, isBusy, speakers, showsWho, takenBy, onMove, onGive, onRemove }: SavedCallRowProps) {
  const { opportunity, category } = saved;
  const state = callState(opportunity);
  const stillDeciding = category === 'interested';
  const event = eventCountdownText(opportunity.eventDate);

  return (
    <CallRowFrame
      opportunity={opportunity}
      dimmed={stillDeciding && state.kind === 'closed'}
      tag={
        showsWho && (
          <span className="inline-flex max-w-full items-center gap-1.5 text-foreground">
            <User aria-hidden="true" />
            <span className="sr-only">Saved for </span>
            <span className="min-w-0 truncate">{savedForLabel(saved.speakerId, speakers)}</span>
          </span>
        )
      }
      lead={
        stillDeciding ? (
          <Countdown opportunity={opportunity} state={state} />
        ) : (
          <LeadFigure figure={event.figure} unit={event.unit} tone={event.figure === 'Past' ? 'quiet' : undefined} />
        )
      }
      actions={
        <>
          <StageMenu
            title={opportunity.title}
            stage={category}
            isBusy={isBusy}
            onMove={(stage) => onMove(saved, stage)}
            onRemove={() => onRemove(saved)}
            speakers={speakers}
            speakerId={saved.speakerId}
            takenBy={takenBy}
            onGive={(speakerId) => onGive(saved, speakerId)}
          />
          <ApplyLink opportunity={opportunity} applied={!stillDeciding} />
        </>
      }
    />
  );
}
