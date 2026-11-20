import { useCallback, useEffect, useRef, useState } from 'react';

export interface RowNotice {
  text: string;
  /** A change that did not happen: shown, not only announced. */
  failed?: boolean;
}

/**
 * For a list whose rows leave it when acted on (a saved call moved to another
 * stage, or removed). The button that was pressed goes with its row, and the
 * browser then drops keyboard focus to the top of the document: this puts it
 * on the list instead, and keeps the sentence that says what happened.
 *
 * `shownRows` is what the list draws now. The row can still be in it for a
 * render or two after `rowLeft` is called, so the check runs after every
 * render until the row is gone.
 */
export function useRowLeaving(shownRows: readonly { id: string }[]) {
  const listRef = useRef<HTMLElement>(null);
  const leavingId = useRef<string | null>(null);
  const [notice, setNotice] = useState<RowNotice | null>(null);

  useEffect(() => {
    const id = leavingId.current;
    if (!id || shownRows.some((row) => row.id === id)) return;
    leavingId.current = null;
    const focused = document.activeElement;
    if (!focused || focused === document.body) listRef.current?.focus();
  });

  const rowLeft = useCallback((id: string, text: string) => {
    leavingId.current = id;
    setNotice({ text });
  }, []);

  return { listRef, notice, setNotice, rowLeft };
}
