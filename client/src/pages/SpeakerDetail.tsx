import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCreateSpeaker, useRemoveSpeaker, useSpeakers, useUpdateSpeaker } from '../hooks/useSpeakers';
import { EMPTY_PROFILE, profileToInput } from '../lib/profileOptions';
import { speakerName } from '../lib/speakerDisplay';
import { ProfileForm } from '../components/profile/ProfileForm';
import { RemoveSpeaker } from '../components/speakers/RemoveSpeaker';
import { Button } from '@/components/ui/button';
import type { SpeakerProfileInput } from '../types';

const BackToSpeakers = () => (
  <Link to="/speakers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-hover hover:text-foreground">
    <ArrowLeft className="size-4" aria-hidden="true" />
    Back to speakers
  </Link>
);

/**
 * One speaker's profile, on the page: `/speakers/new` adds someone,
 * `/speakers/:id` changes or removes them. The roster's one query supplies
 * the speaker, so the page opens without a request of its own.
 */
export function SpeakerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const speakersQuery = useSpeakers({ enabled: isAuthenticated });
  const createSpeaker = useCreateSpeaker();
  const updateSpeaker = useUpdateSpeaker();
  const removeSpeaker = useRemoveSpeaker();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  if (authLoading || (isAuthenticated && speakersQuery.isPending)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const speaker = id ? speakersQuery.data?.find((item) => item.id === id) : undefined;

  if (speakersQuery.error && !speakersQuery.data) {
    return (
      <div role="alert" className="mx-auto max-w-2xl space-y-4 py-6">
        <BackToSpeakers />
        <h1 className="title text-foreground">This speaker did not load</h1>
        <p className="text-sm text-muted-foreground">Check the connection and try again.</p>
        <Button variant="outline" onClick={() => speakersQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (id && !speaker) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-6">
        <BackToSpeakers />
        <h1 className="title text-foreground">Not on your roster</h1>
        <p className="text-sm text-muted-foreground">This speaker was removed, or belongs to another account.</p>
      </div>
    );
  }

  const mutation = speaker ? updateSpeaker : createSpeaker;
  const save = (input: SpeakerProfileInput) => {
    if (speaker) {
      updateSpeaker.mutate({ id: speaker.id, input }, { onSuccess: () => setSavedAt(new Date()) });
    } else {
      createSpeaker.mutate(input, { onSuccess: () => navigate('/speakers') });
    }
  };

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <BackToSpeakers />
      <div>
        <h1 className="title text-foreground">{speaker ? speakerName(speaker) : 'New speaker'}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
          Fit on every call is worked out from these answers alone, so the same answers always rank a call the same way.
        </p>
      </div>

      <ProfileForm
        // Re-seed the form whenever a different stored version arrives.
        key={speaker?.updatedAt ?? 'new'}
        initial={speaker ? profileToInput(speaker) : EMPTY_PROFILE}
        isSaving={mutation.isPending}
        error={mutation.error ? mutation.error.message : null}
        savedAt={savedAt}
        submitLabel={speaker ? 'Save changes' : 'Add speaker'}
        onSubmit={save}
      />

      {speaker && (
        <div className="border-t pt-5">
          <RemoveSpeaker
            name={speakerName(speaker)}
            isRemoving={removeSpeaker.isPending}
            onRemove={() => removeSpeaker.mutate(speaker.id, { onSuccess: () => navigate('/speakers') })}
          />
          {removeSpeaker.error && (
            <p role="alert" className="mt-2 text-sm text-foreground">
              {speakerName(speaker)} was not removed. Try again.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default SpeakerDetail;
