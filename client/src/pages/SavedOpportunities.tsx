import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRowLeaving } from '../hooks/useRowLeaving';
import { useForWhom } from '../hooks/useForWhom';
import { EVERYONE, savedFor, savedForLabel } from '../lib/forWhom';
import {
  useRemoveSavedOpportunity,
  useSavedOpportunities,
  useChangeSavedCall,
} from '../hooks/useSavedOpportunities';
import type { SavedCategory } from '../types';
import {
  DEFAULT_STAGE,
  SAVED_STAGES,
  STAGE_LABELS,
  countByStage,
  isStage,
  savedInStage,
  stageCaption,
  type SavedCall,
} from '../lib/savedStage';
import { CallRowSkeleton } from '../components/browse/CallList';
import { SavedCallRow } from '../components/saved/SavedCallRow';
import { SegmentedSwitch } from '../components/SegmentedSwitch';
import { ForWhomSelect } from '../components/ForWhomSelect';
import { Button } from '@/components/ui/button';

const STAGE_HEADINGS: Record<SavedCategory, string> = {
  interested: 'Calls you are interested in',
  applied: 'Calls you have applied to',
  accepted: 'Calls that accepted you',
  rejected: 'Calls that did not work out',
};

/** What an empty stage says: what it is for, so the next step is plain. */
const EMPTY_STAGE: Record<SavedCategory, { title: string; body: string }> = {
  interested: {
    title: 'Nothing waiting to be applied to.',
    body: 'Save a call on Browse and it shows up here, soonest deadline first.',
  },
  applied: {
    title: 'No applications out.',
    body: 'When you apply to a call, move it here to keep track of it.',
  },
  accepted: {
    title: 'No accepted talks yet.',
    body: 'Move a call here when the organizer says yes.',
  },
  rejected: {
    title: 'Nothing here.',
    body: 'A call that did not work out can be kept here, out of the way.',
  },
};

/**
 * The calls you saved, as a pipeline: one row of control (the stage switch,
 * with what is in each stage), then that stage's calls as the same rows Browse
 * uses. The stage is in the URL, so back and a shared link land on it. On a
 * roster of several, the list is everyone's (each row says whose) or one
 * person's, and a row can be given to someone else.
 */
export function SavedOpportunities() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const savedQuery = useSavedOpportunities({ enabled: isAuthenticated });
  const removeSaved = useRemoveSavedOpportunity();
  const changeSaved = useChangeSavedCall();
  const forWhom = useForWhom({ allowNobody: true });

  const stageParam = searchParams.get('stage');
  const stage = isStage(stageParam) ? stageParam : DEFAULT_STAGE;
  const allItems = savedQuery.data ?? [];
  // Everything below (the counts, the caption, the rows) is about the people chosen.
  const items = savedFor(allItems, forWhom.choice);
  const inStage = savedInStage(items, stage);
  const { listRef, notice, setNotice, rowLeft } = useRowLeaving(inStage);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const setStage = (next: SavedCategory) => {
    setNotice(null);
    setSearchParams(next === DEFAULT_STAGE ? {} : { stage: next }, { replace: true });
  };

  const isLoading = savedQuery.isPending;
  const counts = countByStage(items);
  const caption = stageCaption(stage, inStage);
  const nothingSaved = !isLoading && allItems.length === 0;

  const isBusy = (savedId: string) =>
    (changeSaved.isPending && changeSaved.variables?.savedId === savedId) ||
    (removeSaved.isPending && removeSaved.variables === savedId);

  const handleMove = (saved: SavedCall, category: SavedCategory) =>
    changeSaved.mutate(
      { savedId: saved.id, category },
      {
        onSuccess: () => rowLeft(saved.id, `${saved.opportunity.title} moved to ${STAGE_LABELS[category]}.`),
        onError: () => setNotice({ text: `${saved.opportunity.title} was not moved. Try again.`, failed: true }),
      }
    );

  const handleGive = (saved: SavedCall, speakerId: string | null) => {
    const said = `${saved.opportunity.title} is now saved for ${savedForLabel(speakerId, forWhom.speakers)}.`;
    changeSaved.mutate(
      { savedId: saved.id, speakerId },
      {
        // With everyone listed the row stays and only its name changes; otherwise it leaves this list.
        onSuccess: () => (forWhom.choice === EVERYONE ? setNotice({ text: said }) : rowLeft(saved.id, said)),
        onError: () => setNotice({ text: `${saved.opportunity.title} was not moved. Try again.`, failed: true }),
      }
    );
  };

  const handleRemove = (saved: SavedCall) =>
    removeSaved.mutate(saved.id, {
      onSuccess: () => rowLeft(saved.id, `${saved.opportunity.title} removed from saved.`),
      onError: () => setNotice({ text: `${saved.opportunity.title} was not removed. Try again.`, failed: true }),
    });

  return (
    <div className="space-y-4">
      {/* The page is the list; its name is for screen readers and the tab says where you are. */}
      <h1 className="sr-only">Saved calls</h1>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedSwitch
          label="Which saved calls to list"
          value={stage}
          onChange={setStage}
          stackCounts
          options={SAVED_STAGES.map((value) => ({
            value,
            label: STAGE_LABELS[value],
            count: isLoading ? undefined : counts[value],
          }))}
        />
        {caption && !notice?.failed && <p className="text-[13px] text-muted-foreground">{caption}</p>}
        {/* Always mounted, so a change is announced: a move is only heard, a failure is also seen. */}
        <p
          role="status"
          className={notice?.failed ? 'inline-flex items-center gap-1.5 text-[13px] text-foreground' : 'sr-only'}
        >
          {notice?.failed && <AlertTriangle className="size-3.5 flex-none text-critical" aria-hidden="true" />}
          {notice?.text}
        </p>
        {forWhom.canChoose && (
          <div className="ml-auto">
            <ForWhomSelect
              label="For"
              speakers={forWhom.speakers}
              value={forWhom.choice}
              onChange={(next) => {
                setNotice(null);
                forWhom.setChoice(next);
              }}
              withNobody
            />
          </div>
        )}
      </div>

      <section ref={listRef} tabIndex={-1} aria-labelledby="saved-stage-heading" className="focus:outline-none">
        <h2 id="saved-stage-heading" className="sr-only">
          {STAGE_HEADINGS[stage]}
        </h2>

        {savedQuery.error && !savedQuery.data ? (
          <div role="alert" className="border-t py-10">
            <p className="heading text-foreground">The saved calls did not load.</p>
            <p className="mt-1 text-sm text-muted-foreground">Check the connection and try again.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => savedQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <ul className="border-t" aria-busy="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <CallRowSkeleton key={index} />
            ))}
          </ul>
        ) : inStage.length === 0 ? (
          <div className="border-t py-14">
            <p className="heading text-foreground">{nothingSaved ? 'Nothing saved yet.' : EMPTY_STAGE[stage].title}</p>
            <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
              {nothingSaved ? EMPTY_STAGE.interested.body : EMPTY_STAGE[stage].body}
            </p>
            {(nothingSaved || stage === 'interested') && (
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link to="/">Browse calls</Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="border-t">
            {inStage.map((saved) => (
              <SavedCallRow
                key={saved.id}
                saved={saved}
                isBusy={isBusy(saved.id)}
                speakers={forWhom.speakers}
                showsWho={forWhom.canChoose && forWhom.choice === EVERYONE}
                takenBy={allItems.filter((item) => item.opportunityId === saved.opportunityId).map((item) => item.speakerId)}
                onMove={handleMove}
                onGive={handleGive}
                onRemove={handleRemove}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default SavedOpportunities;
