import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Skeleton } from './Skeleton'

/**
 * The small figure card Sprig uses for "Total Clips / 0 / +0 since yesterday".
 *
 * A label, a large tabular number, and a quiet delta line. The delta is the
 * only place colour appears, and only when there is a direction to show —
 * a green "+0" is a lie about there being movement.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaDirection,
  hint,
  icon,
  loading = false,
  className,
}: {
  label: ReactNode
  value: ReactNode
  delta?: ReactNode
  deltaDirection?: 'up' | 'down' | 'flat'
  hint?: ReactNode
  icon?: ReactNode
  loading?: boolean
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-600">{label}</p>
        {icon && <span className="shrink-0 text-gray-400">{icon}</span>}
      </div>

      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-gray-900 tabular">
          {value}
        </p>
      )}

      {(delta || hint) && !loading && (
        <p className="mt-1 text-xs">
          {delta && (
            <span
              className={cn(
                'font-medium',
                deltaDirection === 'up' && 'text-success-600',
                deltaDirection === 'down' && 'text-danger-500',
                (!deltaDirection || deltaDirection === 'flat') && 'text-gray-600',
              )}
            >
              {delta}
            </span>
          )}
          {delta && hint && ' '}
          {hint && <span className="text-gray-600">{hint}</span>}
        </p>
      )}
    </div>
  )
}
