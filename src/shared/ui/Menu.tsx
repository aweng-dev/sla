import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * The popover Sprig opens from a "…" button or a filter pill.
 *
 * White, 6px radius, a hairline plus a soft shadow — the only place in the
 * product that gets real elevation, because a popover genuinely floats over
 * content and a hairline alone would not read.
 *
 * Deliberately not a headless-UI dependency: this is one focus trap, one
 * outside-click and one Escape handler, and adding a library for it would pull
 * in a second styling system to override.
 */

export interface MenuItemSpec {
  key: string
  label: ReactNode
  icon?: ReactNode
  onSelect?: () => void
  /** Renders in red and sits below a divider. */
  destructive?: boolean
  disabled?: boolean
  /** Draws a hairline above this item. */
  separated?: boolean
}

export function Menu({
  trigger,
  items,
  align = 'end',
  side = 'bottom',
  fullWidth = false,
  className,
  children,
}: {
  /** Receives `open` so the trigger can show pressed state. */
  trigger: (props: { open: boolean; toggle: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode
  items?: MenuItemSpec[]
  /** Which edge the popover's edge lines up with. */
  align?: 'start' | 'end'
  /** Which way it opens. `top` is for a trigger at the bottom of the viewport —
   *  the rail's account row and quick-create button — where a downward popover
   *  would open off-screen. */
  side?: 'top' | 'bottom'
  /** The root is `inline-flex` so a "…" button shrink-wraps. A trigger that is
   *  meant to span its column — the rail's CTA — needs the root to be a block,
   *  otherwise `w-full` on the button resolves against the shrink-wrap. */
  fullWidth?: boolean
  className?: string
  /** Arbitrary popover content, when a list of items is the wrong shape —
   *  a checkbox filter group, for instance. */
  children?: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={containerRef} className={cn('relative', fullWidth ? 'flex w-full' : 'inline-flex')}>
      {trigger({
        open,
        toggle: () => setOpen((v) => !v),
        ref: (el) => {
          triggerRef.current = el
        },
      })}

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 min-w-[11rem] animate-slide-up rounded-md border border-gray-200 bg-white py-1 shadow-popover',
            side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children
            ? children(close)
            : items?.map((item) => (
                <div key={item.key}>
                  {item.separated && <div className="my-1 border-t border-gray-200" />}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      item.onSelect?.()
                      close()
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                      'disabled:cursor-not-allowed disabled:text-gray-400',
                      item.destructive
                        ? 'text-danger-500 hover:bg-danger-50'
                        : 'text-gray-800 hover:bg-gray-100',
                    )}
                  >
                    {item.icon && <span className="shrink-0 text-gray-600">{item.icon}</span>}
                    {item.label}
                  </button>
                </div>
              ))}
        </div>
      )}
    </div>
  )
}
