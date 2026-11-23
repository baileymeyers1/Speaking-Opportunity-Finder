/* The demo build's stand-in for lib/glass.ts (vite.config.ts swaps it in when VITE_DEMO_MODE is 'true').
   The dither skin has no liquid glass, and the kit's script hangs its API on a global named for JCI, so the
   demo bundle must not carry it at all. Same API: nothing is built, and callers already handle null. */
import type { GlassSegmented, GlassToggle } from './glass';

export type { GlassSegmented, GlassToggle };

export function glassToggle(_button: HTMLElement): GlassToggle | null {
  return null;
}

export function glassSegmented(_group: HTMLElement): GlassSegmented | null {
  return null;
}
