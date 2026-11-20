import type { SavedCategory } from '../../types';
import { callState } from '../../lib/callState';
import { eventCountdownText, type SavedCall } from '../../lib/savedStage';
import { ApplyLink, CallRowFrame } from '../browse/CallRow';
import { Countdown } from '../browse/Countdown';
import { LeadFigure } from '../browse/LeadFigure';
import { StageMenu } from './StageMenu';

interface SavedCallRowProps {
  saved: SavedCall;
  isBusy: boolean;
  onMove: (saved: SavedCall, stage: SavedCategory) => void;
  onRemove: (saved: SavedCall) => void;
}

/**
 * A saved call: the Browse row with a stage menu in place of the save button.
 * While you are still interested it leads with the days left to apply; once
 * you have applied, with the days until the event.
 */
export function SavedCallRow({ saved, isBusy, onMove, onRemove }: SavedCallRowProps) {
  const { opportunity, category } = saved;
  const state = callState(opportunity);
  const stillDeciding = category === 'interested';
  const event = eventCountdownText(opportunity.eventDate);

  return (
    <CallRowFrame
      opportunity={opportunity}
      dimmed={stillDeciding && state.kind === 'closed'}
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
          />
          <ApplyLink opportunity={opportunity} applied={!stillDeciding} />
        </>
      }
    />
  );
}
