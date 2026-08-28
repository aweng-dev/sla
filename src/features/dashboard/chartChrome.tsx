import type { ReactNode } from 'react'
import { CHART } from '@/shared/theme/chartColors'

/**
 * The chart chrome, in one place.
 *
 * Sprig's charts are quiet: a horizontal hairline grid and nothing else. No
 * axis lines, no tick marks, no gradient behind the plot area, no shadow, no
 * animation on mount — a figure that slides into place is a figure the reader
 * has to wait for. Colours come from `chartColors`, never from a hex typed
 * here.
 */

/** Tick text. Small, muted, and tabular by inheritance — `ChartFrame` sets
 *  `font-variant-numeric` on the wrapper and SVG text inherits it. */
export const AXIS_TICK = { fill: CHART.axis, fontSize: 11 } as const

export const GRID_STROKE = CHART.grid

/** Wraps a chart so its numerals line up and it cannot push the page wide. */
export function ChartFrame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div className="w-full tabular" style={{ height }}>
      {children}
    </div>
  )
}

export interface ChartTooltipEntry {
  name?: string | number
  value?: string | number | (string | number)[]
  color?: string
  dataKey?: string | number
}

/**
 * The dark tooltip Sprig floats over a plot.
 *
 * Passed as an element — `content={<ChartTooltip … />}` — because Recharts
 * clones it with the live `active` / `payload` / `label` props, which is how a
 * custom tooltip keeps its own configuration without a closure per render.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
}: {
  active?: boolean
  payload?: ChartTooltipEntry[]
  label?: string | number
  /** How to render each datum. Money goes through `formatMoney`, counts
   *  through `formatNumber` — the tooltip never prints a raw minor unit. */
  formatValue: (value: number) => string
  formatLabel?: (label: string) => string
}) {
  if (!active || !payload || payload.length === 0) return null

  const heading =
    label === undefined || label === null || label === ''
      ? (payload[0].name ?? '')
      : formatLabel
        ? formatLabel(String(label))
        : String(label)

  return (
    <div
      className="rounded-md bg-ink-deep px-2.5 py-2 text-2xs leading-4 text-white tabular"
      role="tooltip"
    >
      {heading !== '' && <p className="font-medium">{heading}</p>}
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry, index) => {
          const raw = Array.isArray(entry.value) ? entry.value[0] : entry.value
          const numeric = typeof raw === 'number' ? raw : Number(raw)

          return (
            <li key={`${String(entry.dataKey ?? entry.name ?? index)}`} className="flex items-center gap-1.5">
              {entry.color && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
              )}
              {/* The series name only earns its place when there is more than
                  one of them. On a single-series chart the heading has already
                  said what this is, and repeating it reads as a stutter. */}
              {payload.length > 1 && entry.name !== undefined && (
                <span className="text-gray-400">{entry.name}</span>
              )}
              <span className="font-medium">
                {Number.isFinite(numeric) ? formatValue(numeric) : '—'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The legend beside a donut, in Sprig's own order: the figures lead and the
 * label closes — "45% · 5 · Very easy".
 *
 * Written as a list rather than as Recharts' own legend so the numerals sit in
 * the same tabular column as everything else on the page.
 */
export function ChartLegend({
  items,
}: {
  items: { key: string; label: string; value: string; color: string }[]
}) {
  return (
    <ul className="min-w-0 space-y-1.5">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-xs">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="shrink-0 font-medium text-gray-900 tabular">{item.value}</span>
          <span className="min-w-0 truncate font-medium text-gray-600">{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
