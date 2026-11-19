/* Liquid glass: real refraction, the JCI Intelligence system's signature. It goes only on things that move
   and float over something worth bending (BRAND.md section 6); in this app, the theme switch's knob.

   vendor/jci/liquid-glass.js is the kit's file, byte for byte, so a kit update is a file copy. It hangs its
   API on window.JCI and looks there for its springs when a control is built, so they are handed over here. */
import '@/vendor/jci/liquid-glass.js';
import { Spring, animator, reduced } from './motion';

export interface GlassToggle {
  /** Slides the knob to on (true) or off. */
  go(state: boolean): void;
  /** Where the knob comes to rest for a state, in viewport coordinates. */
  landing(state: boolean): { x: number; y: number };
}

interface JciGlobal {
  glass: {
    /** False outside Chromium: the lens then falls back to a soft frost with the same bezel. */
    refracts: boolean;
    toggle(target: HTMLElement): GlassToggle | null;
  };
}

const jci = (window as unknown as { JCI: JciGlobal }).JCI;
Object.assign(jci, { Spring, animator, reduced });

const toggles = new WeakMap<HTMLElement, GlassToggle>();

/**
 * Makes a `.lswitch` button's knob a bead of glass. Built once per element: the kit's script adds observers
 * it never removes, and React's strict mode runs effects twice.
 */
export function glassToggle(button: HTMLElement): GlassToggle | null {
  const existing = toggles.get(button);
  if (existing) return existing;
  if (typeof ResizeObserver === 'undefined') return null;
  const toggle = jci.glass.toggle(button);
  if (toggle) toggles.set(button, toggle);
  return toggle;
}
