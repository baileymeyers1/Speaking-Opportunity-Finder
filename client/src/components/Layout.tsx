import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { isDemo } from '@/lib/demo';
import { DemoFooter } from './demo/DemoFooter';
import { Navbar } from './Navbar';

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:border focus:border-input focus:bg-card focus:px-4 focus:py-2 focus:text-foreground"
    >
      Skip to main content
    </a>
  );
}

/**
 * The public demo's frame: the blue bar, the page, the blue footer at the foot of the window however short
 * the page. The front door (/login) is the whole page, with no bar above it.
 */
function DemoLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const frontDoor = pathname === '/login';
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />
      {!frontDoor && <Navbar />}
      <main id="main-content" className={frontDoor ? undefined : 'container w-full flex-1 py-8'}>
        {children}
      </main>
      <DemoFooter />
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  if (isDemo) return <DemoLayout>{children}</DemoLayout>;
  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <Navbar />
      <main id="main-content" className="container py-8">
        {children}
      </main>
    </div>
  );
}
