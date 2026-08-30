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
    <div className={cn('h-full min-w-0 rounded-lg border border-gray-200 bg-white p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium text-gray-600 sm:text-sm">{label}</p>
        {icon && <span className="shrink-0 text-gray-400">{icon}</span>}
      </div>

      {loading ? (
        <Skeleton className="mt-2 h-7 w-20 sm:h-8" />
      ) : (
        <p className="mt-1.5 text-xl font-bold tracking-[-0.02em] text-gray-900 tabular sm:text-2xl">
          {value}
        </p>
      )}

      {(delta || hint) && !loading && (
        <p className="mt-1 text-xs leading-5 sm:mt-1.5 sm:text-sm">
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
