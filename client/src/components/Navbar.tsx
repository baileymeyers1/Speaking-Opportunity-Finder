import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { isDemo } from '@/lib/demo';
import { cn } from '@/lib/utils';
import { DitherFade } from './demo/DitherFade';
import { Lockup } from './Lockup';
import { NavTabs, type NavTab } from './NavTabs';
import { ThemeSwitch } from './ThemeSwitch';

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const tabs: NavTab[] = [
    { to: '/', label: 'Browse' },
    ...(isAuthenticated ? [{ to: '/saved', label: 'Saved' }, { to: '/speakers', label: 'Speakers' }] : []),
    // Demo accounts are never admins, and the demo build has no admin page.
    ...(!isDemo && isAuthenticated && user?.isAdmin ? [{ to: '/admin/dashboard', label: 'Analytics' }] : []),
  ];

  const closeSheet = () => setSheetOpen(false);

  return (
    <>
      {/* In the demo the bar is the blue field (dither.css re-points its tokens) and fades into the page. */}
      <header className={cn('sticky top-0 z-50 w-full border-b bg-background', isDemo && 'demo-masthead')}>
        <div className="container grid h-16 grid-cols-[auto_1fr_auto] items-stretch gap-[18px] md:gap-9">
          <div className="flex items-center">
            <Lockup />
          </div>

          <NavTabs tabs={tabs} />

          <div className="col-start-3 flex items-center gap-3">
            {/* The demo has one theme. */}
            {!isDemo && <ThemeSwitch />}

            <div className="hidden items-center gap-3 md:flex">
              {isAuthenticated ? (
                <Button variant="ghost" size="sm" onClick={logout}>
                  Logout
                </Button>
              ) : isDemo ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/login">Enter the demo</Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/login">Login</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/register">Sign up</Link>
                  </Button>
                </>
              )}
            </div>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle className="text-left text-[15px] font-medium">Speaking Finder</SheetTitle>
                  <SheetDescription className="sr-only">Pages and your account</SheetDescription>
                </SheetHeader>
                <nav aria-label="Mobile navigation" className="mt-6 flex flex-col">
                  {tabs.map((tab) => (
                    <Link
                      key={tab.to}
                      to={tab.to}
                      onClick={closeSheet}
                      aria-current={pathname === tab.to ? 'page' : undefined}
                      className="-ml-px border-l-2 border-transparent py-2 pl-3 text-[15px] text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
                    >
                      {tab.label}
                    </Link>
                  ))}
                  <Separator className="my-4" />
                  {isAuthenticated ? (
                    <Button
                      variant="ghost"
                      className="justify-start px-3"
                      onClick={() => {
                        logout();
                        closeSheet();
                      }}
                    >
                      Logout
                    </Button>
                  ) : isDemo ? (
                    <Button variant="outline" asChild>
                      <Link to="/login" onClick={closeSheet}>
                        Enter the demo
                      </Link>
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <Button variant="ghost" className="justify-start px-3" asChild>
                        <Link to="/login" onClick={closeSheet}>
                          Login
                        </Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link to="/register" onClick={closeSheet}>
                          Sign up
                        </Link>
                      </Button>
                    </div>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      {isDemo && <DitherFade direction="down" id="masthead" />}
    </>
  );
}
