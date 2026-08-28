import { useState, type ReactNode } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'

/**
 * The right-hand facts rail.
 *
 * Sprig's study detail puts the entity's own metadata in a narrow column
 * beside the content — key/value rows under collapsible headings, quiet type,
 * no card chrome of its own. The same shape suits an invoice: the lines are
 * what you came to read, and the session, origin and dates are reference.
 */
export function DetailPanel({ children }: { children: ReactNode }) {
  return (
    <aside className="w-full shrink-0 lg:w-72">
      <div className="rounded-lg border border-gray-200 bg-white">{children}</div>
    </aside>
  )
}

export function DetailSection({
  title,
  children,
  defaultOpen = true,
  actions,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  actions?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="border-b border-gray-200 last:border-b-0">
      <div className="flex items-center gap-1 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 text-left text-sm font-semibold text-gray-900"
        >
          <CaretRight
            size={11}
            weight="bold"
            className={cn('text-gray-500 transition-transform duration-150', open && 'rotate-90')}
          />
          {title}
        </button>
        {actions}
      </div>
      {open && <div className="px-4 pb-3">{children}</div>}
    </section>
  )
}

/** A label on the left in muted ink, its value on the right in dark ink. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs font-medium text-gray-600">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-gray-900">{children}</dd>
    </div>
  )
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-gray-100">{children}</dl>
}
