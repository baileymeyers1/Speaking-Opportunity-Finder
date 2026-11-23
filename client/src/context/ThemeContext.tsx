import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isDemo } from '@/lib/demo';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DARK_QUERY = '(prefers-color-scheme: dark)';
// index.html reads the same key before first paint, so the page never flashes the wrong theme.
const STORAGE_KEY = 'theme';

// The demo has one theme, the dither skin (data-theme on <html>), and never takes the dark class.
const resolveTheme = (theme: Theme, systemDark: boolean): ResolvedTheme =>
  !isDemo && (theme === 'dark' || (theme === 'system' && systemDark)) ? 'dark' : 'light';

const applyTheme = (resolved: ResolvedTheme) =>
  document.documentElement.classList.toggle('dark', resolved === 'dark');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    (localStorage.getItem(STORAGE_KEY) as Theme) || 'system'
  );
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  const resolvedTheme = resolveTheme(theme, systemDark);

  // The document changes inside this call, not after the next render: the theme switch wraps it in a view
  // transition, which snapshots the page as soon as the call returns.
  const setTheme = useCallback((next: Theme) => {
    applyTheme(resolveTheme(next, window.matchMedia(DARK_QUERY).matches));
    setThemeState(next);
  }, []);

  // Follow the OS preference while it changes
  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_QUERY);
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Mirror the resolved theme onto the document and remember the choice
  useEffect(() => {
    applyTheme(resolvedTheme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
