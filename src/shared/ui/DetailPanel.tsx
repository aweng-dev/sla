import { useState, type ReactNode } from 'react'
import { CaretDown, X } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'

/**
 * The facts rail Sprig puts down the right of every detail screen.
 *
 * ── Why a record's identity does not belong in its header ──────────────────
 *
 * A detail screen has two kinds of content: the thing you came to DO — a
 * roster, a register, a list of responses — and the facts that say WHICH record
 * you are doing it to. Sprig separates them, and the separation is why its
 * study pages stay readable: the header carries a title and one line of
 * context, the main column carries the work, and everything else — type,
 * folder, who made it, when it launched, how it is targeted — lives in a
 * panel down the side.
 *
 * Crammed into a header instead, those facts push the work below the fold and
 * the header becomes a wall of small grey text nobody reads.
 *
 * ── Sections collapse; the panel does not scroll away ──────────────────────
 *
 * Sprig's sections carry a caret and remember being shut. The panel itself is
 * sticky, because the facts are what you check WHILE working in the main
 * column — a rail you have to scroll back up to is a rail you stop using.
 *
 * ── Below `lg` it is not a rail ────────────────────────────────────────────
 *
 * There is no room for two columns on a phone, so the caller stacks it above
 * or below the work. That is a layout decision and belongs to the caller;
 * this component only draws the panel.
 */
export function DetailPanel({
  title,
  onClose,
  children,
  className,
}: {
  title: ReactNode
  /** Offered only where there is somewhere to go back to. Sprig's × swaps the
   *  panel for another; a panel that is the only one has nothing to close to. */
  onClose?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <aside
      className={cn(
        'rounded-lg border border-gray-200 bg-white lg:sticky lg:top-4 lg:self-start',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={13} weight="bold" />
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-200">{children}</div>
    </aside>
  )
}

/**
 * One collapsible group of facts.
 *
 * Open by default: a panel that starts shut is a panel whose contents nobody
 * discovers. Shutting one is for a reader who has decided they do not need it.
 */
export function DetailSection({
  title,
  defaultOpen = true,
  action,
  children,
}: {
  title: ReactNode
  defaultOpen?: boolean
  /** A small control belonging to this group — "Change", "Add". Sits on the
   *  heading row rather than among the rows, so it is never mistaken for a
   *  value. */
  action?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-gray-900"
        >
          <CaretDown
            size={11}
            weight="bold"
            className={cn(
              'shrink-0 text-gray-500 transition-transform duration-150',
              !open && '-rotate-90',
            )}
          />
          <span className="truncate">{title}</span>
        </button>
        {action && <span className="shrink-0">{action}</span>}
      </div>

      {open && <dl className="mt-2 flex flex-col gap-2">{children}</dl>}
    </section>
  )
}

/**
 * One fact.
 *
 * Label above value rather than beside it. Sprig sets them side by side in a
 * 250px panel, which works for "Type: Replay" and breaks the moment a value is
 * a person's full name or a course title — the two collide and the label wraps.
 * Stacked, a long value simply takes the width it needs.
 */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 truncate text-xs text-gray-900">{children}</dd>
    </div>
  )
}
