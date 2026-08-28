import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * The title block at the top of every screen.
 *
 * Sprig's is quiet: a 20px semibold title, an optional muted line under it,
 * and actions on the right. No breadcrumb bar, no coloured banner, no icon
 * beside the title on a list screen — the icon appears only on a detail screen,
 * where it carries the entity's identity.
 */
export function PageHeader({
  title,
  description,
  icon,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Entity identity on a detail screen — a tinted square, as Sprig draws it. */
  icon?: ReactNode
  /** A row of small facts under the title: status, owner, dates. */
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-gray-900">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
          {meta && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
              {meta}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** The tinted rounded square Sprig puts beside a detail-screen title. */
export function EntityIcon({
  children,
  tone = 'accent',
}: {
  children: ReactNode
  tone?: 'accent' | 'brand' | 'neutral'
}) {
  return (
    <span
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg',
        tone === 'accent' && 'bg-accent-100 text-accent-700',
        tone === 'brand' && 'bg-brand-200 text-gray-900',
        tone === 'neutral' && 'bg-gray-100 text-gray-700',
      )}
    >
      {children}
    </span>
  )
}

/** A dot between meta facts. */
export function MetaDot() {
  return (
    <span className="text-gray-400" aria-hidden>
      ·
    </span>
  )
}
