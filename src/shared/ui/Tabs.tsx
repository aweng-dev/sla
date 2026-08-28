import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Sprig's underline tabs — icon, label, and a 2px dark rule under the active
 * one. Not pills, not a segmented control.
 *
 * The row itself carries the hairline, so the active tab's rule sits ON the
 * divider rather than above it.
 *
 * ── The ARIA contract, kept ────────────────────────────────────────────────
 *
 * `role="tablist"` promises three things a bare row of buttons does not
 * deliver: arrow keys move between tabs, only the selected tab is in the tab
 * order (so Tab leaves the strip and lands in the panel), and each tab names
 * the panel it controls. Declaring the role without them announces a widget
 * that then does not behave like one, which is worse than plain buttons.
 *
 * The panel side of the contract is the caller's: render the active content in
 * an element with `role="tabpanel"` and `id={tabPanelId(baseId, key)}`, using
 * the `panelId` helper this module exports.
 */
export interface TabItem {
  key: string
  label: ReactNode
  icon?: ReactNode
  /** A trailing count, as Sprig shows on "All Users". */
  count?: number
  disabled?: boolean
}

/** The id a caller must put on the panel for a given tab. */
export function panelId(baseId: string, key: string): string {
  return `${baseId}-panel-${key}`
}

export function Tabs({
  items,
  value,
  onChange,
  bare = false,
  /** Pass the same id to `panelId()` when rendering the panel, so each tab can
   *  point at the content it controls. */
  baseId,
  className,
}: {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  baseId?: string
  /** Drop the strip's own hairline. Set when the tabs sit inside a
   *  `PageHeader`, which draws one full-bleed for them — the active tab's
   *  underline is meant to land ON that rule, not on a second one 32px in. */
  bare?: boolean
  className?: string
}) {
  const fallbackId = useId()
  const id = baseId ?? fallbackId
  const enabled = items.filter((item) => !item.disabled)

  /* Left/Right move selection; Home/End jump to the ends. Standard tablist
   * behaviour, and the reason the role is worth declaring at all. */
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key) || enabled.length === 0) return

    event.preventDefault()
    const current = enabled.findIndex((item) => item.key === value)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? enabled.length - 1
          : event.key === 'ArrowLeft'
            ? (current - 1 + enabled.length) % enabled.length
            : (current + 1) % enabled.length

    onChange(enabled[next].key)
  }

  return (
    <div
      role="tablist"
      className={cn('flex items-center gap-5', !bare && 'border-b border-gray-200', className)}
    >
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            id={`${id}-tab-${item.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={panelId(id, item.key)}
            /* Only the selected tab is a tab stop — Tab moves OUT of the strip
             * into the panel, rather than through every tab in turn. */
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onKeyDown={onKeyDown}
            onClick={() => onChange(item.key)}
            className={cn(
              'relative -mb-px flex items-center gap-1.5 border-b-2 pb-2 pt-1 text-sm transition-colors',
              'disabled:cursor-not-allowed disabled:text-gray-400',
              /* Weight does NOT change between states. Sprig sets every tab
               * semibold and lets the rule carry the selection; dropping the
               * inactive ones to regular grey — which this did — made the
               * strip read as one heading and some links. */
              active
                ? 'border-gray-900 font-semibold text-gray-900'
                : 'border-transparent font-semibold text-gray-700 hover:text-gray-900',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className="text-xs text-gray-500 tabular">{item.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
