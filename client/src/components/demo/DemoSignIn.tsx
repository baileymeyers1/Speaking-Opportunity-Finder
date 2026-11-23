import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { DitherFade } from './DitherFade';

/**
 * The demo's front door, in place of the password form: one button opens a fresh account with the sample
 * roster (`POST /api/auth/demo`), then Browse, as after a login. `Layout` gives it the whole page.
 */
export function DemoSignIn() {
  const navigate = useNavigate();
  const { enterDemo, isAuthenticated } = useAuth();
  const [isEntering, setIsEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleEnter = async () => {
    setError(null);
    setIsEntering(true);
    try {
      await enterDemo();
      navigate('/');
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'The demo did not open. Try again.');
      setIsEntering(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col">
      <div className="demo-field flex-1">
        <div className="container flex flex-wrap items-center justify-between gap-x-6 pt-2 text-sm font-normal">
          <a href="https://baileymeyers.com" className="inline-flex min-h-11 items-center underline underline-offset-4">
            Back to baileymeyers.com
          </a>
          <span>Demo with a sample roster</span>
        </div>
        <div className="container flex flex-wrap items-end gap-x-[72px] gap-y-10 pb-[clamp(56px,8vw,104px)] pt-[clamp(40px,9vw,120px)]">
          <div className="min-w-0 flex-[999_1_520px]">
            <h1 className="font-serif text-[clamp(52px,7vw,112px)] font-medium italic leading-[0.98] tracking-[-0.01em]">
              Speaking Finder
            </h1>
            <p className="mt-7 max-w-[36ch] text-[clamp(18px,1.5vw,22px)] leading-[1.55]">
              Calls for speakers from real listings, with a sample roster of three speakers. Your account lasts this
              visit only.
            </p>
          </div>
          <div className="flex flex-[1_1_320px] flex-col gap-3">
            <Button type="button" size="lg" className="h-14 text-[17px]" disabled={isEntering} onClick={handleEnter}>
              {isEntering && <Loader2 className="animate-spin" aria-hidden="true" />}
              {isEntering ? 'Opening the demo…' : 'Enter the demo'}
            </Button>
            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm font-normal">
                <AlertCircle className="mt-0.5 size-4 flex-none" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
      <DitherFade direction="down" id="front-door" />
    </div>
  );
}
