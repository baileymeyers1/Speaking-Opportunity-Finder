import { useCallback, useSyncExternalStore } from 'react';
import { EVERYONE, hasChoice, resolveForWhom, type ForWhom } from '../lib/forWhom';
import { useAuth } from './useAuth';
import { useSpeakers } from './useSpeakers';

const STORAGE_KEY = 'speaking-finder:for-whom';
const CHANGED = 'speaking-finder:for-whom-changed';

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private windows and blocked site data: the choice then lasts for the page.
    return memory;
  }
}

let memory: string | null = null;

function write(choice: ForWhom) {
  memory = choice;
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Kept in memory above.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Whose calls and whose fit the lists show. One remembered choice for the
 * browser, shared by Browse and Saved, so picking Dana on one is still Dana
 * on the other. It is a convenience of this browser, not account data: the
 * roster decides what a remembered value means (`resolveForWhom`).
 */
export function useForWhom(options: { allowNobody?: boolean } = {}) {
  const { isAuthenticated } = useAuth();
  const speakersQuery = useSpeakers({ enabled: isAuthenticated });
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const speakers = speakersQuery.data ?? [];
  const choice = isAuthenticated ? resolveForWhom(stored, speakers, options) : EVERYONE;
  const setChoice = useCallback((next: ForWhom) => write(next), []);

  return {
    choice,
    setChoice,
    speakers,
    /** False while there is nobody to choose between: the picker is not shown. */
    canChoose: isAuthenticated && hasChoice(speakers),
    isLoading: isAuthenticated && speakersQuery.isPending,
  };
}
