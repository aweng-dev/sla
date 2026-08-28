/**
 * Dates and greetings for a screen that opens on a person's day.
 *
 * Everything here takes the institution's timezone explicitly. A boarding
 * school in Lagos read from a laptop still on London time is one hour from
 * showing the wrong day's lessons, and "today" is the only word on this screen
 * that a reader will not double-check.
 */

/** `2026-08-28` for the given instant in the given zone. `en-CA` is used for
 *  the format alone — it is the one common locale that formats a date as ISO. */
export function todayInTimeZone(timeZone: string | null | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    // An institution row carrying a timezone the runtime does not know.
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  }
}

/** The first day of the month `months` before the month `isoDate` falls in. */
export function monthsBefore(isoDate: string, months: number): string {
  const [year, month] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 - months, 1))
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${shiftedMonth}-01`
}

/** The hour of day in the institution's zone, for the greeting. */
function hourInTimeZone(timeZone: string | null | undefined, now = new Date()): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timeZone ?? undefined,
        hour: '2-digit',
        hour12: false,
      }).format(now),
    )
  } catch {
    return now.getHours()
  }
}

export function greeting(timeZone: string | null | undefined, now = new Date()): string {
  const hour = hourInTimeZone(timeZone, now)
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** The name to greet somebody by. A preferred name where the record carries
 *  one, otherwise the first word of their name — never the full legal string,
 *  which reads as a form letter. */
export function firstName(name: string | null | undefined): string {
  if (!name) return 'there'
  const first = name.trim().split(/\s+/)[0]
  return first || 'there'
}

/** `2026-08` → `Aug`, `2026-08-14` → `14 Aug`. Axis labels only; the tooltip
 *  spells the period out in full. */
export function shortPeriodLabel(period: string): string {
  const parts = period.split('-').map(Number)
  if (parts.length === 2) {
    return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(
      new Date(parts[0], parts[1] - 1, 1),
    )
  }
  if (parts.length === 3) {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(
      new Date(parts[0], parts[1] - 1, parts[2]),
    )
  }
  return period
}

/** `2026-08` → `August 2026`. */
export function longPeriodLabel(period: string): string {
  const parts = period.split('-').map(Number)
  if (parts.length === 2) {
    return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
      new Date(parts[0], parts[1] - 1, 1),
    )
  }
  if (parts.length === 3) {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(parts[0], parts[1] - 1, parts[2]))
  }
  return period
}

/** `08:30:00` → `08:30`. Timetable slots carry a wall-clock time with no zone,
 *  because a lesson happens at half past eight wherever the reader is. */
export function slotTime(value: string | null | undefined): string {
  if (!value) return '—'
  const match = /^(\d{2}):(\d{2})/.exec(value)
  return match ? `${match[1]}:${match[2]}` : value
}

/**
 * A currency figure short enough for a chart axis.
 *
 * `formatMoney` is the right answer everywhere a figure is read as a figure,
 * but "₦1,417,500.00" is 14 characters and an axis has room for four. The
 * minor-unit scale is resolved the same way `formatMoney` resolves it — from
 * the currency's own fraction digits — so this is still not a division by 100.
 */
export function compactMoney(minor: number, currency: string, locale = 'en-NG'): string {
  const full = new Intl.NumberFormat(locale, { style: 'currency', currency })
  const digits = full.resolvedOptions().maximumFractionDigits ?? 2

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minor / 10 ** digits)
}
