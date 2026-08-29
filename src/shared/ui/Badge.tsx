import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * The small chip Sprig puts beside a nav item ("Beta"), in a table cell (a
 * status), and on a plan ("Free").
 *
 * `brand` paints the yellow as a FILL with dark ink on it. There is no variant
 * that renders yellow text.
 */
type Tone = 'neutral' | 'accent' | 'brand' | 'success' | 'danger' | 'warning' | 'outline'

const TONES: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  accent: 'bg-accent-50 text-accent-700',
  brand: 'bg-brand-100 text-gray-900',
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-700',
  /* Dark ink on the yellow, exactly as `brand` above. There is no variant
   * that renders yellow as a foreground. */
  warning: 'bg-brand-100 text-gray-900',
  outline: 'border border-gray-300 bg-white text-gray-700',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot = false,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  /** A leading dot, for a status that is a state rather than a label. */
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-2xs font-semibold leading-4',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

/** Maps an API status string onto a tone, so every table agrees on what
 *  "suspended" looks like. Unknown values fall back to neutral rather than
 *  inventing a colour. */
const STATUS_TONES: Record<string, Tone> = {
  active: 'accent',
  enrolled: 'accent',
  paid: 'accent',
  published: 'accent',
  approved: 'accent',
  completed: 'accent',
  pending: 'warning',
  draft: 'neutral',
  submitted: 'accent',
  under_review: 'accent',
  processing: 'accent',
  partial: 'warning',
  overdue: 'danger',
  failed: 'danger',
  rejected: 'danger',
  withdrawn: 'danger',
  suspended: 'danger',
  cancelled: 'neutral',
  archived: 'neutral',
  inactive: 'neutral',
  graduated: 'accent',
  transferred: 'neutral',
}

/** The dot colour for each tone, since the status reads as a dot plus text
 *  rather than as a filled chip. */
const DOT_TONES: Record<Tone, string> = {
  neutral: 'bg-gray-400',
  accent: 'bg-accent-500',
  brand: 'bg-brand-400',
  success: 'bg-success-500',
  danger: 'bg-danger-500',
  warning: 'bg-brand-600',
  outline: 'bg-gray-400',
}

/**
 * A status, as Sprig renders one: a small coloured dot and plain ink.
 *
 * NOT a filled chip. Sprig's tables carry their status values as ordinary text
 * — a roster of a hundred learners with a hundred green pills down one column
 * is a column of decoration, and the colour stops meaning anything precisely
 * where it is needed most. The dot keeps the at-a-glance scan; the pill was
 * doing nothing the dot does not.
 *
 * `Badge` is still the right thing for a genuine chip — a "Beta" marker, a plan
 * name, a count — where the fill is the point.
 */
export function StatusBadge({ status, className }: { status: string | null; className?: string }) {
  if (!status) return <span className="text-gray-500">—</span>

  const key = status.toLowerCase()
  const label = key.replace(/[_-]+/g, ' ')
  const tone = STATUS_TONES[key] ?? 'neutral'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-sm capitalize leading-5 text-gray-900',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_TONES[tone])} aria-hidden />
      {label}
    </span>
  )
}
