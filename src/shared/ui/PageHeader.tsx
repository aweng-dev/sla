import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * The title block at the top of every screen.
 *
 * Sprig's canvas has no application chrome. The page begins with a title band:
 * large extra-bold ink on the left, actions on the right, a full-bleed hairline
 * under the band, then either tabs sitting on that rule or the toolbar.
 *
 * Sampled proportions (1440-wide captures):
 *   - List title ("Studies") ~24px extra-bold, 20px above, 16px below
 *   - Greeting ("Welcome to Sprig, Alex") ~28px extra-bold
 *   - Entity title (next to a 32px identity tile) ~20px bold, with a meta row
 *     of 13–15px facts immediately underneath
 *   - Header actions are 36px tall, 8px apart, vertically centred on the title
 *   - Tabs sit in the band; the active tab's 2px rule lands ON the hairline
 *
 * ── `description` is for a screen that genuinely needs a sentence ──────────
 *
 * Sprig uses none at all on list pages. Prefer `meta`. Reach for `description`
 * only where the screen would be genuinely unclear without it.
 */
export function PageHeader({
  title,
  description,
  icon,
  breadcrumb,
  meta,
  actions,
  tabs,
  size,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Entity identity on a detail screen — a tinted square, as Sprig draws it. */
  icon?: ReactNode
  /** Wayfinding above the title: "Learners / Jane Doe", Sprig's breadcrumb. */
  breadcrumb?: ReactNode
  /** A row of small facts under the title: status, owner, dates. */
  meta?: ReactNode
  actions?: ReactNode
  /**
   * The screen's tab strip.
   *
   * Passed IN rather than rendered after, because in Sprig the tabs belong to
   * the header band: the strip sits under the title and the active tab's
   * underline lands on the header's own rule.
   *
   * Pass `<Tabs bare … />` — this band draws the rule.
   */
  tabs?: ReactNode
  /**
   * `page` is the list/settings title (24px). `display` is the dashboard
   * greeting (28px). Entity screens (an `icon` is present) use the 20px size
   * regardless, matching Sprig's study-detail header.
   */
  size?: 'page' | 'display'
  className?: string
}) {
  const entity = Boolean(icon)
  const display = size === 'display' && !entity

  return (
    <header
      className={cn(
        /* Full-bleed rule, padded content. The header's bottom border runs
         * edge to edge across the canvas while the title sits on the same
         * gutter as everything below it. */
        '-mx-4 border-b border-gray-200 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
        entity ? 'pt-4' : display ? 'pt-6' : 'pt-5',
        tabs ? 'pb-0' : entity ? 'pb-3.5' : 'pb-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="min-w-0">
            {breadcrumb && (
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-600">
                {breadcrumb}
              </div>
            )}
            <h1
              className={cn(
                'truncate text-gray-900',
                entity && 'text-title-sm',
                display && 'text-display',
                !entity && !display && 'text-title',
              )}
            >
              {title}
            </h1>
            {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
            {meta && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-gray-600">
                {meta}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>
        )}
      </div>

      {tabs && <div className="mt-3">{tabs}</div>}
    </header>
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
        'flex h-8 w-8 items-center justify-center rounded-lg [&_svg]:h-5 [&_svg]:w-5',
        tone === 'accent' && 'bg-accent-100 text-accent-700',
        tone === 'brand' && 'bg-brand-200 text-gray-900',
        tone === 'neutral' && 'bg-gray-100 text-gray-700',
      )}
    >
      {children}
    </span>
  )
}

/** A slash between breadcrumb segments, matching Sprig's "Studies / Folder". */
export function BreadcrumbSep() {
  return (
    <span className="text-gray-400" aria-hidden>
      /
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
