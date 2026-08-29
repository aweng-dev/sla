import palette from '../../../palette.js'

/**
 * Colour VALUES, for the places a utility class cannot reach.
 *
 * Recharts takes `fill` and `stroke` as props, a `conic-gradient()` is a
 * string, and a category-to-colour map is data. None of those can be a
 * Tailwind class, so they come from here — and because this file reads
 * `palette.js`, the one source of truth, a palette change reaches them too.
 *
 * NEVER write a hex in a component. That is how ~1,350 usages once stayed on
 * stock Tailwind after a "complete" palette swap.
 */

/** Series colours, in Sprig's own order: purple, yellow, teal, magenta,
 *  coral. Never green, never red. */
export const CATEGORICAL: string[] = palette.categorical

/** Named single-purpose chart colours.
 *
 *  Sprig's charts never use emerald green or bright red as a series. The
 *  "best" rating is purple, the "worst" is coral — see the five-bar rating
 *  scale on https://mobbin.com/screens/983b06fe-bfd9-4c44-a56a-a39a8c347428.
 *  Green is a toast fill only; keep it off plots. */
export const CHART = {
  primary: palette.accent[500],
  primarySoft: palette.accent[100],
  secondary: palette.brand[400],
  secondarySoft: palette.brand[200],
  tertiary: palette.teal[500],
  positive: palette.accent[500],
  positiveSoft: palette.accent[100],
  negative: palette.coral[500],
  negativeSoft: palette.coral[100],
  neutral: palette.neutral[300],
  grid: palette.neutral[200],
  axis: palette.neutral[600],
  tooltipBg: palette.surface.inkDeep,
  tooltipInk: palette.surface.white,
} as const

/** Attainment bands, best to worst — Sprig's five-point rating series. */
export const GRADE_BANDS = {
  excellent: palette.accent[500],
  good: palette.brand[400],
  fair: palette.teal[500],
  poor: palette.magenta[500],
  fail: palette.coral[500],
} as const

/** Status fills for chips and dots. Active is the accent (Sprig never
 *  paints a green status chip). Coral stands in for "bad" because Sprig
 *  never uses bright red as a fill. */
export const STATUS_COLORS = {
  active: palette.accent[500],
  pending: palette.brand[400],
  inactive: palette.neutral[400],
  suspended: palette.coral[500],
  archived: palette.neutral[500],
  failed: palette.coral[500],
} as const

/** Offered in colour pickers — Sprig's five series plus ink. */
export const SWATCHES: string[] = [
  palette.accent[500],
  palette.brand[400],
  palette.teal[500],
  palette.magenta[500],
  palette.coral[500],
  palette.neutral[700],
]

export const DEFAULT_SWATCH = palette.accent[500]

/** Deterministic colour for an arbitrary key — a subject, a class, a category
 *  the server did not colour. The same name always gets the same colour. */
export function colorForKey(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  return CATEGORICAL[Math.abs(hash) % CATEGORICAL.length]
}
