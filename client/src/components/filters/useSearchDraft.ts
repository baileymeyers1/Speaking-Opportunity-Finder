import { useCallback, useEffect, useRef, useState } from 'react';
import { SEARCH_DEBOUNCE_MS } from '../../filters/constants';

/**
 * Local draft of the search box. Typing updates the draft immediately and
 * commits it (to the URL) after a pause; `flush` commits right away, which the
 * Live Search button and the Enter key use so they never act on a stale term.
 * External changes to the committed value (back navigation, "Clear all", a
 * saved search) replace the draft unless the user is mid-keystroke.
 */
export function useSearchDraft(committed: string, onCommit: (value: string) => void) {
  const [draft, setDraft] = useState(committed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCommit = useRef(onCommit);
  useEffect(() => {
    latestCommit.current = onCommit;
  });

  useEffect(() => {
    if (timer.current === null) setDraft(committed);
  }, [committed]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const cancelTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const update = useCallback((value: string) => {
    setDraft(value);
    cancelTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      latestCommit.current(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  /** Commit the draft now. Returns the trimmed term so callers can use it immediately. */
  const flush = useCallback((): string => {
    const term = draft.trim();
    cancelTimer();
    if (term !== committed) latestCommit.current(term);
    return term;
  }, [draft, committed]);

  return { draft, update, flush };
}
