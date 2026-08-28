import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/shared/lib/cn'

/**
 * The screens this feature is allowed to send somebody to.
 *
 * A literal union rather than `string`, because the router's `Link` types its
 * `to` against the real route tree — widening it to `string` here would only
 * move the error to whoever adds the next route.
 */
export type BuiltRoute = '/dashboard' | '/students' | '/account' | '/settings' | '/login'

/**
 * A destination that should look like a button.
 *
 * `Button` renders a real `<button>`, which is right for an action and wrong
 * for a route: the one control on a dead end is exactly the thing somebody
 * middle-clicks. Rather than teach the shared primitive to polymorph, this
 * wears its recipe on an anchor and stays in this feature.
 */
export function LinkButton({
  to,
  variant = 'secondary',
  icon,
  children,
}: {
  to: BuiltRoute
  variant?: 'primary' | 'secondary'
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap',
        'rounded-md px-3 text-sm transition-colors duration-100',
        variant === 'primary'
          ? 'bg-brand-400 font-medium text-gray-900 hover:bg-brand-500 active:bg-brand-600'
          : 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 active:bg-gray-100',
      )}
    >
      {icon}
      {children}
    </Link>
  )
}
