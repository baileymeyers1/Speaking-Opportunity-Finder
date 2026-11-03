import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useProfile, useUpdateProfile } from '../hooks/useProfile';
import { ProfileForm } from '../components/profile/ProfileForm';
import { profileToInput } from '../lib/profileOptions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function Profile() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const profileQuery = useProfile({ enabled: isAuthenticated });
  const updateProfile = useUpdateProfile();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  if (authLoading || (isAuthenticated && profileQuery.isPending)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (profileQuery.error) {
    return (
      <div role="alert" className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold text-foreground">Could not load your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">{profileQuery.error.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => profileQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const profile = profileQuery.data ?? null;
  const saveError = updateProfile.error ? updateProfile.error.message : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Speaker profile</h1>
        <p className="mt-1 text-muted-foreground">
          Tell the finder what you talk about and where you will go. Every opportunity then gets a match score
          with the reasons behind it, and you can sort the{' '}
          <Link to="/?sort=match" className="font-medium text-primary hover:underline">
            browse page by best match
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {profile ? 'Your profile' : 'Set up your profile'}
          </CardTitle>
          <CardDescription>
            Scores are computed from these answers alone: no AI guesswork, so the same profile always ranks the
            same listing the same way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            // Re-seed the form whenever a different stored version arrives.
            key={profile?.updatedAt ?? 'new'}
            initial={profileToInput(profile)}
            isSaving={updateProfile.isPending}
            error={saveError}
            savedAt={savedAt}
            onSubmit={(input) =>
              updateProfile.mutate(input, {
                onSuccess: () => setSavedAt(new Date()),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default Profile;
