import type { ReactNode } from 'react';
import { Navbar } from './Navbar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:border focus:border-input focus:bg-card focus:px-4 focus:py-2 focus:text-foreground"
      >
        Skip to main content
      </a>
      <Navbar />
      <main id="main-content" className="container py-8">
        {children}
      </main>
    </div>
  );
}
