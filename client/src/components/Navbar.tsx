import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Mic2, Moon, Sun } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isAdmin = user?.isAdmin;

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string) =>
    cn(
      'text-sm font-medium transition-colors hover:text-foreground/80',
      isActive(path) ? 'text-foreground' : 'text-foreground/60'
    );

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        {/* Logo */}
        <Link to="/" className="mr-6 flex items-center space-x-2">
          <Mic2 className="h-5 w-5" />
          <span className="font-bold">Speaking Finder</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center space-x-6">
          <Link to="/" className={navLinkClass('/')}>
            Browse
          </Link>
          {isAuthenticated && (
            <Link to="/saved" className={navLinkClass('/saved')}>
              Saved
            </Link>
          )}
          {isAuthenticated && isAdmin && (
            <Link
              to="/admin/dashboard"
              className={navLinkClass('/admin/dashboard')}
            >
              Analytics
            </Link>
          )}
        </nav>

        {/* Right side: theme toggle + auth (desktop) */}
        <div className="ml-auto flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          <div className="hidden md:flex items-center space-x-2">
            {isAuthenticated ? (
              <Button variant="ghost" size="sm" onClick={logout}>
                Logout
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">Login</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/register">Sign Up</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile: sheet trigger */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center space-x-2">
                  <Mic2 className="h-5 w-5" />
                  <span>Speaking Finder</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col space-y-3">
                <Link
                  to="/"
                  onClick={() => setSheetOpen(false)}
                  className={cn(
                    'px-2 py-1.5 text-sm font-medium rounded-md transition-colors',
                    isActive('/')
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground/60 hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  Browse
                </Link>
                {isAuthenticated && (
                  <Link
                    to="/saved"
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      'px-2 py-1.5 text-sm font-medium rounded-md transition-colors',
                      isActive('/saved')
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground/60 hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    Saved
                  </Link>
                )}
                {isAuthenticated && isAdmin && (
                  <Link
                    to="/admin/dashboard"
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      'px-2 py-1.5 text-sm font-medium rounded-md transition-colors',
                      isActive('/admin/dashboard')
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground/60 hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    Analytics
                  </Link>
                )}
                <Separator />
                {isAuthenticated ? (
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      logout();
                      setSheetOpen(false);
                    }}
                  >
                    Logout
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" className="justify-start" asChild>
                      <Link to="/login" onClick={() => setSheetOpen(false)}>
                        Login
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link to="/register" onClick={() => setSheetOpen(false)}>
                        Sign Up
                      </Link>
                    </Button>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
