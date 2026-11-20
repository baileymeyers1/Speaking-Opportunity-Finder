import { Link, Navigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSpeakers } from '../hooks/useSpeakers';
import { fitCaption } from '../lib/speakerDisplay';
import { SpeakerRow, SpeakerRowSkeleton } from '../components/speakers/SpeakerRow';
import { Button } from '@/components/ui/button';

/**
 * The roster: the people this account finds stages for, one row each. One
 * row of control (what Browse scores fit for, and the way to add someone),
 * then the list.
 */
export function Speakers() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const speakersQuery = useSpeakers({ enabled: isAuthenticated });

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

  const speakers = speakersQuery.data ?? [];
  const isLoading = speakersQuery.isPending;
  const addSpeaker = (
    <Button asChild>
      <Link to="/speakers/new">
        <Plus aria-hidden="true" />
        Add speaker
      </Link>
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* The page is the list; its name is for screen readers and the tab says where you are. */}
      <h1 className="sr-only">Speakers</h1>

      {speakersQuery.error && !speakersQuery.data ? (
        <div role="alert" className="border-t py-10">
          <p className="heading text-foreground">The speakers did not load.</p>
          <p className="mt-1 text-sm text-muted-foreground">Check the connection and try again.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => speakersQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : !isLoading && speakers.length === 0 ? (
        <div className="border-t py-14">
          <p className="heading text-foreground">Nobody on the roster yet.</p>
          <p className="mb-4 mt-1 max-w-[60ch] text-sm text-muted-foreground">
            Add yourself or the first person you find stages for. Every call then gets a fit score for them, with the
            reasons behind it.
          </p>
          {addSpeaker}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[13px] text-muted-foreground">{fitCaption(speakers)}</p>
            {addSpeaker}
          </div>
          <ul className="border-t" aria-busy={isLoading}>
            {isLoading
              ? Array.from({ length: 3 }).map((_, index) => <SpeakerRowSkeleton key={index} />)
              : speakers.map((speaker) => <SpeakerRow key={speaker.id} speaker={speaker} />)}
          </ul>
        </>
      )}
    </div>
  );
}

export default Speakers;
