/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** 'true' builds the public demo (lib/demo.ts). */
  readonly VITE_DEMO_MODE?: string;
}
