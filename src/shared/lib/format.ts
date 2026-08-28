/**
 * Formatting that has to agree across the whole product.
 *
 * ── Money is in MINOR UNITS ────────────────────────────────────────────────
 *
 * The API sends `charged_minor`, `collected_minor`, `balance_minor` — integers
 * in the currency's smallest unit, because a fee schedule summed as a float
 * drifts. Nothing in this app divides by 100 by hand; it calls `formatMoney`,
 * which knows that not every currency has two decimal places.
 */

const DEFAULT_LOCALE = 'en-NG'

export function formatMoney(
  minor: number | null | undefined,
  currency = 'NGN',
  locale = DEFAULT_LOCALE,
): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return '—'

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  })

  /* `minimumFractionDigits` tells us how many minor units make a major one —
   * 100 for NGN and USD, 1 for JPY, 1000 for KWD. Dividing by a hard-coded 100
   * would be wrong for two of those. */
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(minor / 10 ** digits)
}

export function formatNumber(value: number | null | undefined, locale = DEFAULT_LOCALE): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale).format(value)
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 0,
  locale = DEFAULT_LOCALE,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

/** The API sends ISO 8601 throughout — dates as `YYYY-MM-DD`, stamps with an
 *  offset. A bare date is parsed as UTC by `new Date`, which renders as the
 *  previous day west of Greenwich, so it is split rather than parsed. */
export function formatDate(value: string | null | undefined, timeZone?: string): string {
  if (!value) return '—'

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(y, m - 1, d))
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(parsed)
}

export function formatDateTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(parsed)
}

/** "2 hours ago". Sprig's tables lean on this heavily. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'

  const seconds = Math.round((parsed.getTime() - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: 'auto' })

  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ]

  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.round(seconds / size), unit)
    }
  }

  return rtf.format(Math.round(seconds), 'second')
}

/** "14:32". The companion to a day-grouped list: the divider states the date
 *  once, so the row only has to say where in that day it landed. */
export function formatTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return '\u2014'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '\u2014'

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(parsed)
}

/**
 * The label on a day divider: "Today", "Yesterday", "Thursday", "12 Aug 2026".
 *
 * It degrades in that order on purpose. Inside the last week a weekday is how
 * people actually hold a date — "Thursday" places itself, "4 days ago" has to
 * be counted back — and past that only the date itself is unambiguous.
 */
export function formatDayHeading(value: string | null | undefined): string {
  if (!value) return 'Undated'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Undated'

  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((midnight(new Date()) - midnight(parsed)) / 86_400_000)

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days > 1 && days < 7) {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, { weekday: 'long' }).format(parsed)
  }
  return formatDate(value)
}

/** Initials for an avatar fallback. Two letters, from the first and last word,
 *  so "Coralie Rosenbaum" is CR and "Prince" is P. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Turn an API enum into a label when there is no server-provided one.
 *  `payment_pending` → `Payment pending`. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  const spaced = value.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
