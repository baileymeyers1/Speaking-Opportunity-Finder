/** @type {import('tailwindcss').Config} */

// Colours live in src/styles/tokens.css as R G B channels (the JCI Intelligence kit's values).
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // The kit's script holds no class names of ours; scanning it turned `!btn` and `!filter` in its code into rules.
    '!./src/vendor/**',
  ],
  theme: {
    // The kit's measure: 1240px, 20px gutters.
    container: {
      center: true,
      padding: '1.25rem',
      screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1240px' },
    },
    extend: {
      colors: {
        // Hairlines carry their own alpha, so they sit right on paper and on sheets alike.
        border: 'var(--rule)',
        input: 'var(--rule-2)',
        ring: token('ring'),
        background: token('background'),
        foreground: token('foreground'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        // Status always comes with an icon and a label; the colour goes on the icon.
        good: token('good'),
        warning: token('warning'),
        critical: token('critical'),
        info: token('info'),
        // Placeholders and marks. Too light for body text: use muted-foreground for that.
        faint: token('ink-3'),
        scrim: 'var(--scrim)',
      },
      // Sheets 14px, controls 10px, tags 6px. Pills are for switches only.
      borderRadius: {
        lg: 'var(--radius-sheet)',
        md: 'var(--radius-control)',
        sm: 'var(--radius-tag)',
      },
      // Sheets are flat in light and carry an inset highlight in dark; only floating things cast a shadow.
      boxShadow: {
        sm: 'var(--panel-shadow)',
        md: 'var(--float-shadow)',
        lg: 'var(--float-shadow)',
      },
      // Outfit sets everything, read-outs included (tabular figures). There is no monospace in this system.
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-accent)'],
        mono: ['var(--font-sans)'],
      },
      fontSize: {
        base: ['0.9375rem', { lineHeight: '1.55' }],
      },
      spacing: {
        control: 'var(--control-height)',
      },
      // The kit's clocks by name (an arbitrary `duration-[160ms]` is ambiguous beside tailwindcss-animate).
      transitionDuration: {
        hover: 'var(--dur-1)',
        state: 'var(--dur-2)',
        data: 'var(--dur-3)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        spring: 'var(--ease-spring)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
