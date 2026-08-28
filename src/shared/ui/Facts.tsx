import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * The key/value list a detail screen is mostly made of.
 *
 * Sprig renders a record's facts as hairline-separated rows: the label in
 * muted ink on the left, the value in primary ink on the right, both at the
 * product's 13px body size. The label is a caption and carries no weight of
 * its own — colour is the whole hierarchy, exactly as Sprig's form labels do
 * it.
 *
 * These live here rather than in a feature because every entity screen needs
 * them and two copies would drift. `Facts` is the `<dl>`; `Fact` is a row.
 */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-gray-200">{children}</dl>
}

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2">
      <dt className="shrink-0 text-sm text-gray-600">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-gray-900">{children}</dd>
    </div>
  )
}

/**
 * A boolean state, drawn the way `StatusBadge` draws an API status: a coloured
 * dot and plain ink.
 *
 * Distinct from `StatusBadge` because that one maps API status STRINGS, and
 * the things this renders are not among them — `is_on_roll`,
 * `is_legal_guardian`, `can_pick_up` are each a different question with its
 * own words. Filling one as a chip would put a fact that is merely true into
 * the loudest shape on the screen.
 */
export function Flag({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-900">
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', on ? 'bg-success-500' : 'bg-gray-400')}
        aria-hidden
      />
      {children}
    </span>
  )
}
