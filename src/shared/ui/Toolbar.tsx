import { forwardRef, type ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'

/**
 * The row Sprig puts between the tabs and the table: filter pills on the left,
 * search and the primary action on the right.
 */
export function Toolbar({
  filters,
  actions,
  className,
}: {
  filters?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2.5 py-3.5', className)}>
      <div className="flex flex-wrap items-center gap-2">{filters}</div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}

/**
 * The dropdown-looking button a filter opens from.
 *
 * A button rather than a `<select>`, because Sprig's filters are multi-select
 * checkbox popovers and a native select cannot be one. `active` shows the
 * filter is doing something, which is the difference between "Status" and
 * "Status (4)".
 */
export const FilterPill = forwardRef<
  HTMLButtonElement,
  {
    label: ReactNode
    /** How many values are chosen. Rendered in parentheses, as Sprig does. */
    count?: number
    open?: boolean
    active?: boolean
    icon?: ReactNode
    onClick?: () => void
    className?: string
  }
>(function FilterPill({ label, count, open, active, icon, onClick, className }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="menu"
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm font-medium transition-colors',
        'hover:bg-gray-50',
        active || open ? 'border-gray-400 text-gray-900' : 'border-gray-300 text-gray-800',
        className,
      )}
    >
      {icon && <span className="text-gray-600">{icon}</span>}
      {label}
      {count !== undefined && count > 0 && <span className="text-gray-600 tabular">({count})</span>}
      <CaretDown size={14} weight="bold" className="text-gray-600" />
    </button>
  )
})
