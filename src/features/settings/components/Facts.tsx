import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * A label on the left, the fact on the right — the one row shape every
 * read-only block on this screen is built from, so a list written for the
 * institution record and one written for the calendar still line up.
 *
 * Both halves are 13px. Sprig sets a caption in grey and the value it captions
 * in ink at the SAME size, so the two sit on one baseline; the earlier 12px
 * label against a 13px value left every row very slightly out of true.
 *
 * The label is medium and the value regular. Measured off Sprig's own Study
 * Details panel: the key column is the heavier of the two and colour separates
 * them a second time. A key/value list where the key is grey AND light reads as
 * two columns of body copy.
 */
export function FactRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm font-medium text-gray-600">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-gray-900">{children}</dd>
    </div>
  )
}

export function FactList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('divide-y divide-gray-200', className)}>{children}</dl>
}

/** The line a card carries when what it shows cannot be changed from here. Says
 *  who does own the value, because "read-only" on its own sends the reader
 *  nowhere. */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs text-gray-500">{children}</p>
}
