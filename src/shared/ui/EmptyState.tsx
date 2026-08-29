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
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-600 [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <p className="text-md font-semibold text-gray-900">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-gray-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
