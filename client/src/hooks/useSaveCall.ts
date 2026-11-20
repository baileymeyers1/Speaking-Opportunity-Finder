import { useNavigate } from 'react-router-dom';
import type { Opportunity, SavedCategory, SavedOpportunity } from '../types';
import { useAuth } from './useAuth';
import { useSavedOpportunities } from './useSavedOpportunities';
import { useSaveOpportunity, type SaveResult } from './useSaveOpportunity';

interface SaveCallOptions {
  /** Called once the call is saved; a live result comes back as the stored row it was promoted to. */
  onSaved?: (result: SaveResult) => void;
}

const NOT_SAVED: SavedOpportunity[] = [];

/**
 * Saving one call: the rows it is already saved under (one per speaker it is
 * saved for, and one for nobody), read from the account's saved list, and a
 * save that sends a signed-out visitor to log in first.
 */
export function useSaveCall(opportunity: Opportunity | undefined, options: SaveCallOptions = {}) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const mutation = useSaveOpportunity();
  // One query for the whole page: every row reads the same cached list.
  const savedQuery = useSavedOpportunities({ enabled: isAuthenticated });
  const savedRows =
    opportunity && savedQuery.data ? savedQuery.data.filter((item) => item.opportunityId === opportunity.id) : NOT_SAVED;

  const save = (category: SavedCategory, speakerId: string | null) => {
    if (!opportunity) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    mutation.mutate(
      { opportunity, category, speakerId },
      {
        onSuccess: (result) => options.onSaved?.(result),
        onError: (error) => console.error('Failed to save:', error),
      }
    );
  };

  return { savedRows, isSaving: mutation.isPending, save };
}
