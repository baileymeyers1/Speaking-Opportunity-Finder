import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Opportunity, SavedCategory } from '../types';
import { useAuth } from './useAuth';
import { useSaveOpportunity } from './useSaveOpportunity';

/**
 * Saving one call from a list: the category it was saved under in this visit,
 * and a save that sends a signed-out visitor to log in first.
 */
export function useSaveCall(opportunity: Opportunity) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const mutation = useSaveOpportunity();
  const [savedCategory, setSavedCategory] = useState<SavedCategory | ''>('');

  const save = (category: SavedCategory) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    mutation.mutate(
      { opportunity, category },
      {
        onSuccess: () => setSavedCategory(category),
        onError: (error) => console.error('Failed to save:', error),
      }
    );
  };

  return { savedCategory, isSaving: mutation.isPending, save };
}
