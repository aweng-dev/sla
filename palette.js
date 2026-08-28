/**
 * The Sprig palette.
 *
 * ── Why a JS file and not just CSS variables ───────────────────────────────
 *
 * This app addresses colour almost entirely through *stock Tailwind ramps* —
 * `gray-200`, `indigo-600`, `emerald-500` — and only lightly through the
 * `sl-*` design tokens. Swapping `tokens.css` alone therefore changes almost
 * nothing visible. The leverage is in remapping the ramps, and a ramp map is
 * a JS object: `tailwind.config.js` imports this file and points every stock
 * ramp at it. `tokens.css` mirrors the same hexes for the CSS custom
 * properties, because CSS cannot import JS and both must change together.
 *
 * ── Where the values came from ─────────────────────────────────────────────
 *
 * Pixel-sampled from Sprig's own web app captures rather than eyeballed. The
 * sampled anchors, and the ramp step each one pins:
 *
 *   #2f2f2f  primary ink              → neutral-900
 *   #8e8e8e  Sprig's muted text       → neutral-400 (see the ramp's own note)
 *   #a7a6a7  faint text               → neutral-400 neighbourhood
 *   #dedede  strong border            → neutral-300
 *   #efefef  hairline border          → neutral-200
 *   #eeeeee  active nav row           → neutral-200/250
 *   #f9f9f9  sidebar ground           → neutral-50
 *   #ffffff  canvas AND card          → both, deliberately
 *   #faf8f4  table header band        → --sl-surface-table-head
 *   #f8d030  the yellow CTA           → brand-400
 *   #fde596  yellow tint              → brand-200
 *   #6a5cc8  the one accent hue       → accent-500
 *   #0c232f  floating bulk-action bar → --sl-ink-deep
 *
 * ── Two rules the sampling settled ─────────────────────────────────────────
 *
 *   1. Canvas and cards are BOTH pure white. Sprig separates surfaces with a
 *      hairline, never with a tint and never with a shadow. A card on a grey
 *      canvas is a different product.
 *
 *   2. Yellow is a FILL, never text. `brand` and `accent` are separate ramps
 *      for exactly this reason — the accent has to survive as 14px body text
 *      and yellow does not. Nothing in this app may set `text-yellow-*`.
 *
 * ── Sprig runs ONE accent hue ──────────────────────────────────────────────
 *
 * There is no blue in this product. `indigo`, `blue`, `purple`, `violet` and
 * `sky` all resolve to the same purple ramp, so a component that reached for
 * whichever one its author preferred still lands on the palette.
 */

/**
 * Achromatic. Sprig's greys carry no hue at all — a tinted grey reads as a
 * different paper stock next to the pure-white canvas.
 *
 * ── The one place this departs from the sample, and why ────────────────────
 *
 * Sprig's own muted text is #8e8e8e. On its white canvas that is 3.28:1, which
 * fails WCAG AA for body text, and this product puts real information in muted
 * ink — table headers, field hints, the second line of every table cell, the
 * request id on an error. Copying the sample faithfully would mean shipping a
 * school's administrative records at a contrast a third of its staff cannot
 * comfortably read.
 *
 * So the step that carries TEXT is #767676 (4.54:1) and the sampled #8e8e8e
 * moves down to the decorative steps, where it lands on inactive carets and
 * disabled glyphs that carry no information. At 13px the two are barely
 * distinguishable; the difference is entirely in whether the text passes.
 *
 * The consequence for authors: `text-gray-500` — the class anybody reaches for
 * when they mean "muted" — is the ACCESSIBLE one. `text-gray-400` is the
 * decorative one. That way the reflexive choice is the correct choice, and
 * nobody has to remember this note.
 */
export const neutral = {
  50: '#f9f9f9',
  100: '#f3f3f3',
  200: '#efefef',
  300: '#dedede',
  400: '#a7a6a7',
  500: '#767676',
  600: '#5e5e5e',
  700: '#4d4d4d',
  800: '#3d3d3d',
  900: '#2f2f2f',
  950: '#1c1c1c',
}

/** The single accent hue. Used for links, selected state, primary charts. */
export const accent = {
  50: '#f2f1fb',
  100: '#e6e4f7',
  200: '#cfcbef',
  300: '#b0a9e4',
  400: '#8d83d6',
  500: '#6a5cc8',
  600: '#5a4cb4',
  700: '#4a3e96',
  800: '#3c3378',
  900: '#322c62',
  950: '#1f1a3d',
}

/** The CTA yellow. A fill only — see the note above. */
export const brand = {
  50: '#fefaea',
  100: '#fdf3c8',
  200: '#fde596',
  300: '#fbd75c',
  400: '#f8d030',
  500: '#fbc902',
  600: '#dba800',
  700: '#ae7f04',
  800: '#8f640b',
  900: '#79520f',
  950: '#462b03',
}

export const success = {
  50: '#eaf7f0',
  100: '#d0edde',
  200: '#a3dbc0',
  300: '#6cc39c',
  400: '#41ab7f',
  500: '#2e9e6b',
  600: '#237e55',
  700: '#1d6445',
  800: '#1a5038',
  900: '#17422f',
  950: '#0a2519',
}

export const danger = {
  50: '#fdeeee',
  100: '#fbd9d9',
  200: '#f6b6b6',
  300: '#ef8a8a',
  400: '#e35d5d',
  500: '#d33f3f',
  600: '#b52e2e',
  700: '#962626',
  800: '#7c2323',
  900: '#682222',
  950: '#390d0d',
}

/** Categorical only — never a status. Sprig's charts use these beside the
 *  accent and the brand yellow. */
export const coral = {
  50: '#fef1ee',
  100: '#fddfd8',
  200: '#fbc0b2',
  300: '#f79a83',
  400: '#f2825f',
  500: '#ef7a5a',
  600: '#d95c39',
  700: '#b4472a',
  800: '#933c26',
  900: '#7a3624',
  950: '#421810',
}

export const magenta = {
  50: '#fdf0f7',
  100: '#fbdcee',
  200: '#f8bade',
  300: '#f28ac6',
  400: '#e75da8',
  500: '#d63f8c',
  600: '#b92c70',
  700: '#99245b',
  800: '#7f214d',
  900: '#6b2043',
  950: '#400a24',
}

export const teal = {
  50: '#eaf7f7',
  100: '#cfeded',
  200: '#a2dbdb',
  300: '#6bc2c4',
  400: '#3fa8ac',
  500: '#2b8f95',
  600: '#227279',
  700: '#1e5c62',
  800: '#1c4b51',
  900: '#1a3f45',
  950: '#0a2429',
}

/** Surfaces and single-purpose colours that are not part of any ramp. */
export const surface = {
  /** Canvas AND cards. Both, deliberately. */
  white: '#ffffff',
  /** The sidebar's ground, one step off the canvas. */
  rail: '#f9f9f9',
  /** The active nav row — one step darker than the rail again. This is the
   *  ONLY thing that marks the current page: no left bar, no accent, no
   *  colour. */
  railActive: '#eeeeee',
  /** The table header band — warm, and the one warm neutral in the system. */
  tableHead: '#faf8f4',
  /** The sign-in illustration panel. */
  cream: '#f2eeea',
  /** The floating bulk-action bar and other inverted chrome. */
  inkDeep: '#0c232f',
}

/** Colour VALUES for anything that cannot take a utility class — Recharts
 *  props, gradient strings, category maps. Never write a hex in a component;
 *  import from `@/shared/theme/chartColors` which re-exports these. */
export const categorical = [
  accent[500],
  brand[500],
  coral[500],
  teal[500],
  magenta[500],
  accent[800],
  brand[300],
  teal[700],
]

export const palette = {
  neutral,
  accent,
  brand,
  success,
  danger,
  coral,
  magenta,
  teal,
  surface,
  categorical,
}

export default palette
