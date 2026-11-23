import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { glassToggle, type GlassToggle } from '@/lib/glass';
import { reduced } from '@/lib/motion';
import { revealFrames } from '@/lib/themeReveal';

const REVEAL_MS = 720;
// The switch rides its own view-transition layer and shows only its live image, so the knob never freezes
// while the rest of the page holds still (styles/jci.css).
const SWITCH_LAYER = 'theme-switch';

/**
 * The kit's theme switch. The knob is a bead of clear glass that magnifies the sun or moon it rests on and
 * bends the other as it crosses; the new theme opens from where it lands, as one 720ms motion.
 */
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const buttonRef = useRef<HTMLButtonElement>(null);
  const knobRef = useRef<GlassToggle | null>(null);
  const knobIsDark = useRef(dark);
  const busy = useRef(false);

  useEffect(() => {
    if (buttonRef.current) knobRef.current = glassToggle(buttonRef.current);
  }, []);

  // The theme changed somewhere else (the OS preference): move the knob to match.
  useEffect(() => {
    if (knobIsDark.current === dark) return;
    knobIsDark.current = dark;
    knobRef.current?.go(dark);
  }, [dark]);

  const handleToggle = () => {
    const button = buttonRef.current;
    if (!button || busy.current) return;
    const nextDark = !dark;
    const nextTheme = nextDark ? 'dark' : 'light';
    const slideKnob = () => knobRef.current?.go(nextDark);
    knobIsDark.current = nextDark;

    if (!document.startViewTransition || reduced() || document.hidden) {
      setTheme(nextTheme);
      slideKnob();
      return;
    }

    busy.current = true;
    const root = document.documentElement;
    root.classList.add('theme-swap');
    button.style.viewTransitionName = SWITCH_LAYER;
    const transition = document.startViewTransition(() => {
      // The new theme, and this button's label, must be in the document before the snapshot is taken.
      flushSync(() => setTheme(nextTheme));
    });
    transition.ready
      .then(() => {
        slideKnob();
        const box = button.getBoundingClientRect();
        const origin = knobRef.current?.landing(nextDark) ?? {
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
        };
        root.animate(revealFrames(origin.x, origin.y), {
          duration: REVEAL_MS,
          easing: 'linear',
          pseudoElement: '::view-transition-new(root)',
        });
      })
      .catch(slideKnob);
    transition.finished.finally(() => {
      root.classList.remove('theme-swap');
      button.style.viewTransitionName = '';
      busy.current = false;
    });
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className="lswitch"
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={handleToggle}
    >
      <Sun strokeWidth={1.5} aria-hidden="true" />
      <Moon strokeWidth={1.5} aria-hidden="true" />
      <span className="lswitch__knob" />
    </button>
  );
}
