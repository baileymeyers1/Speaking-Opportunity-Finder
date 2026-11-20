import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Opportunity, SavedCategory } from '../types';
import { useAuth } from './useAuth';
import { useSaveOpportunity, type SaveResult } from './useSaveOpportunity';

interface SaveCallOptions {
  /** Called once the call is saved; a live result comes back as the stored row it was promoted to. */
  onSaved?: (result: SaveResult) => void;
}

/**
 * Saving one call: the category it was saved under in this visit, and a save
 * that sends a signed-out visitor to log in first.
 */
export function useSaveCall(opportunity: Opportunity | undefined, options: SaveCallOptions = {}) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const mutation = useSaveOpportunity();
  const [savedCategory, setSavedCategory] = useState<SavedCategory | ''>('');

  const save = (category: SavedCategory) => {
    if (!opportunity) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    mutation.mutate(
      { opportunity, category },
      {
        onSuccess: (result) => {
          setSavedCategory(category);
          options.onSaved?.(result);
        },
        onError: (error) => console.error('Failed to save:', error),
      }
    );
  };

  return { savedCategory, isSaving: mutation.isPending, save };
}
