import { defineConfig, loadEnv, type Alias, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400;1,500&family=DM+Sans:wght@300;400;500&display=swap';

/** The demo's head: its own name and icon, the dither theme in the markup (no script, so no flash), its faces. */
const DEMO_HEAD: Array<[RegExp, string]> = [
  [/<html lang="en">/, '<html lang="en" data-theme="dither">'],
  [/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'],
  [
    /<title>[^<]*<\/title>/,
    [
      '<title>Speaking Finder · Demo</title>',
      '<meta name="description" content="Calls for speakers from real listings, with a sample roster." />',
      '<meta name="robots" content="noindex, nofollow" />',
      '<link rel="preconnect" href="https://fonts.googleapis.com" />',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
      `<link rel="stylesheet" href="${GOOGLE_FONTS}" />`,
    ].join('\n    '),
  ],
  // The JCI client's theme script: the demo has one theme and never takes the dark class.
  [/\s*<script>[\s\S]*?<\/script>/, ''],
];

// What must never reach the demo bundle: the JCI name or its mark (jci-logo.svg), in any case.
const JCI_TRACE = /jci/i;

/**
 * Builds the public demo (VITE_DEMO_MODE=true): rewrites index.html's head, and fails the build if anything
 * emitted still names JCI. Each rewrite must find its target, so a change to index.html cannot slip the JCI
 * head into the demo unnoticed.
 */
function demoBuild(): Plugin {
  return {
    name: 'speaking-finder-demo',
    enforce: 'post',
    transformIndexHtml(html) {
      return DEMO_HEAD.reduce((page, [pattern, replacement]) => {
        if (!pattern.test(page)) {
          throw new Error(`Demo build: index.html has nothing matching ${pattern}; update DEMO_HEAD in vite.config.ts.`);
        }
        return page.replace(pattern, replacement);
      }, html);
    },
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        const text = file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : '';
        if (JCI_TRACE.test(text)) this.error(`Demo build: ${file.fileName} still mentions JCI.`);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDemo = loadEnv(mode, __dirname, 'VITE_').VITE_DEMO_MODE === 'true';
  const alias: Alias[] = [
    // The kit's liquid-glass script hangs itself on window.JCI; the demo has no glass, so it gets the stub.
    ...(isDemo ? [{ find: /^@\/lib\/glass$/, replacement: path.resolve(__dirname, './src/lib/glassless.ts') }] : []),
    { find: '@', replacement: path.resolve(__dirname, './src') },
  ];

  return {
    plugins: [react(), ...(isDemo ? [demoBuild()] : [])],
    // public/ holds the JCI mark; the demo ships its own icon instead.
    publicDir: isDemo ? 'public-demo' : 'public',
    resolve: { alias },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
