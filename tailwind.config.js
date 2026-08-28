import { neutral, accent, brand, success, danger, coral, magenta, teal, surface } from './palette.js'

/**
 * ── Why every stock ramp is remapped ───────────────────────────────────────
 *
 * The components in this app reach for `gray-200`, `indigo-600`,
 * `emerald-500` — the names any React developer types without thinking. If a
 * ramp is left unmapped, every one of those usages silently stays on stock
 * Tailwind and the screen ends up half Sprig and half default blue. So the
 * map is exhaustive rather than minimal:
 *
 *   neutrals   gray slate zinc stone      → achromatic Sprig greys
 *   accent     indigo blue purple violet sky → the ONE accent hue (no blue)
 *   success    emerald green teal cyan lime  → one green
 *   danger     red rose                   → one red
 *   brand      amber yellow               → the CTA yellow (fill only)
 *   category   orange → coral, pink/fuchsia → magenta
 *
 * Adding a ramp to Tailwind without adding it here is how ~1,350 usages once
 * stayed on stock colours after a "complete" palette swap.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Neutrals ──────────────────────────────────────────────────────
        gray: neutral,
        slate: neutral,
        zinc: neutral,
        stone: neutral,
        neutral,

        // ── The one accent hue. Sprig has no blue. ────────────────────────
        indigo: accent,
        blue: accent,
        purple: accent,
        violet: accent,
        sky: accent,
        accent,

        // ── Success ───────────────────────────────────────────────────────
        emerald: success,
        green: success,
        cyan: success,
        lime: success,
        success,

        // ── Danger ────────────────────────────────────────────────────────
        red: danger,
        rose: danger,
        danger,

        // ── Brand yellow. A FILL, never text. ─────────────────────────────
        amber: brand,
        yellow: brand,
        brand,

        // ── Categoricals ──────────────────────────────────────────────────
        orange: coral,
        coral,
        pink: magenta,
        fuchsia: magenta,
        magenta,
        teal,

        // ── Named surfaces ────────────────────────────────────────────────
        rail: surface.rail,
        'rail-active': surface.railActive,
        cream: surface.cream,
        'table-head': surface.tableHead,
        'ink-deep': surface.inkDeep,

        // ── Semantic aliases, driven by tokens.css ────────────────────────
        sl: {
          bg: 'var(--sl-bg)',
          surface: 'var(--sl-surface)',
          rail: 'var(--sl-rail)',
          border: 'var(--sl-border)',
          'border-strong': 'var(--sl-border-strong)',
          text: 'var(--sl-text)',
          'text-secondary': 'var(--sl-text-secondary)',
          'text-muted': 'var(--sl-text-muted)',
          accent: 'var(--sl-accent)',
          cta: 'var(--sl-cta)',
          'cta-ink': 'var(--sl-cta-ink)',
        },
      },
      fontFamily: {
        /* Sprig runs TT Commons Pro (TypeType, commercial). Figtree is the
         * closest freely-licensable match — geometric skeleton, circular
         * bowls, double-storey `a`, tall x-height. Inter, the reflexive
         * choice, is a neutral grotesque and reads visibly differently beside
         * a Sprig screen. See the note in src/index.css for how to drop the
         * real face in if a licence is bought. */
        sans: ['Figtree', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      /*
       * ── Measured against Sprig, not guessed ──────────────────────────────
       *
       * An earlier pass read Sprig as a very small, dense product and set the
       * body to 13px. Rendering both at the same scale and measuring the ink
       * showed the opposite: Sprig's nav and table text are roughly a step
       * LARGER than that, and its rows breathe. Sprig is compact in its
       * chrome, not in its type.
       *
       * So the scale sits one step up: 14px carries the body, the nav and the
       * table; 12px is the table header and the micro label; 22px is a page
       * title. Components name these rather than writing arbitrary values, so
       * this block is the one place the whole product's size is decided.
       */
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.125rem' }],
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['0.9375rem', { lineHeight: '1.5rem' }],
        md: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.625rem' }],
        xl: ['1.375rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.75rem', { lineHeight: '2.125rem' }],
        '3xl': ['2.125rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
      boxShadow: {
        // Sprig separates with hairlines, not elevation. The only real shadows
        // in the product are on popovers and the floating bulk-action bar.
        none: 'none',
        xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
        popover: '0 4px 16px rgba(0, 0, 0, 0.10), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        float: '0 8px 28px rgba(12, 35, 47, 0.22)',
      },
      spacing: {
        rail: '14rem',
        'rail-collapsed': '3.5rem',
        topbar: '3.25rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'slide-up': 'slide-up 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}
