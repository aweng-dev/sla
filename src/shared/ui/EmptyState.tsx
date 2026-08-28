import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * What a screen says when there is nothing to show.
 *
 * Three deliberately different cases, because they need different answers:
 * nothing exists yet (offer the action that creates one), nothing matches the
 * filter (offer to clear it), or the request failed (offer to retry, and say
 * what went wrong). Collapsing them into one "No data" is how a user ends up
 * clearing a filter that was not the problem.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-gray-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
