interface DemoLiveSearchNoteProps {
  /** The demo's live searches for today are spent: the list is the stored listings only. */
  limitReached?: boolean;
  /** Live searches the demo has left today, after the one just run. Sent only on a live search's answer. */
  searchesLeft?: number;
}

function searchesLeftLine(left: number): string {
  if (left === 0) return 'No live searches left today in the demo';
  return `${left.toLocaleString('en-US')} live ${left === 1 ? 'search' : 'searches'} left today in the demo`;
}

/** The demo's daily live-search allowance, as one plain line where the live search reports what it did. */
export function DemoLiveSearchNote({ limitReached, searchesLeft }: DemoLiveSearchNoteProps) {
  if (!limitReached && searchesLeft === undefined) return null;
  return (
    <p className="text-[13px] text-muted-foreground" role="status" aria-live="polite">
      {limitReached
        ? "The demo's live searches are used up for today. Results below are from the stored listings."
        : searchesLeftLine(searchesLeft ?? 0)}
    </p>
  );
}
