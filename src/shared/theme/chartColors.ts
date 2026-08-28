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

/** Series colours, in the order they should be assigned. Ordered for
 *  distinguishability at small sizes rather than by hue. */
export const CATEGORICAL: string[] = palette.categorical

/** Named single-purpose chart colours. */
export const CHART = {
  primary: palette.accent[500],
  primarySoft: palette.accent[100],
  secondary: palette.brand[500],
  secondarySoft: palette.brand[200],
  positive: palette.success[500],
  positiveSoft: palette.success[100],
  negative: palette.danger[500],
  negativeSoft: palette.danger[100],
  neutral: palette.neutral[300],
  grid: palette.neutral[200],
  axis: palette.neutral[600],
  tooltipBg: palette.surface.inkDeep,
  tooltipInk: palette.surface.white,
} as const

/** Attainment bands, worst to best. Deliberately NOT a red-to-green ramp at
 *  both ends: a failing grade is red, but a passing one is the accent rather
 *  than green, because green here would read as "task complete". */
export const GRADE_BANDS = {
  excellent: palette.success[500],
  good: palette.accent[500],
  fair: palette.brand[500],
  poor: palette.coral[500],
  fail: palette.danger[500],
} as const

/** Status fills for chips and dots. */
export const STATUS_COLORS = {
  active: palette.success[500],
  pending: palette.brand[600],
  inactive: palette.neutral[400],
  suspended: palette.coral[500],
  archived: palette.neutral[500],
  failed: palette.danger[500],
} as const

/** Offered in colour pickers — a swatch grid a user chooses from. */
export const SWATCHES: string[] = [
  palette.accent[500],
  palette.brand[400],
  palette.coral[500],
  palette.teal[500],
  palette.magenta[500],
  palette.success[500],
  palette.danger[500],
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
