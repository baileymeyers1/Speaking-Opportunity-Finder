/**
 * True in the public demo build (`VITE_DEMO_MODE=true npm run build -w client`): the "blue dither" skin, the
 * front door instead of the password form, no JCI mark. Vite writes the value into the bundle, so each build
 * keeps only its own side of every `isDemo` test. vite.config.ts reads the same variable for the page head.
 */
export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
