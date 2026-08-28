import type { ReactNode } from 'react'
import { X } from '@phosphor-icons/react'

/**
 * The dark pill that floats up from the bottom of a table when rows are
 * selected. Sampled at #0c232f — the one inverted surface in the product.
 *
 * Positioned over the table rather than replacing the toolbar, so the filters
 * that produced the selection stay visible and the count can be checked
 * against them.
 */
export function BulkActionBar({
  count,
  noun = 'item',
  onClear,
  children,
}: {
  count: number
  /** Pluralised naively — `student` becomes `students`. Pass the institution's
   *  own word from `useTerminology()`, not a hard-coded one. */
  noun?: string
  onClear: () => void
  children?: ReactNode
}) {
  if (count === 0) return null

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
      <div className="pointer-events-auto flex animate-slide-up items-center gap-1 rounded-lg bg-ink-deep py-1.5 pl-3 pr-1.5 text-white shadow-float">
        <span className="whitespace-nowrap text-xs font-medium tabular">
          {count} {count === 1 ? noun : `${noun}s`}
        </span>
        <span className="mx-1.5 h-4 w-px bg-white/20" aria-hidden />
        {children}
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={13} weight="bold" />
        </button>
      </div>
    </div>
  )
}
