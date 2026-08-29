import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'

/**
 * A centred dialog over a dimmed canvas.
 *
 * Scroll on the body is locked while it is open — a dialog whose background
 * scrolls under it is the single most common way a modal feels broken. The
 * lock restores the exact previous value rather than clearing it, so nesting
 * two dialogs does not leave the page unscrollable when the inner one closes.
 *
 * ── Focus is the other half of `aria-modal` ────────────────────────────────
 *
 * Declaring `aria-modal="true"` promises that focus cannot leave, and a dialog
 * that makes the promise without keeping it is worse than one that never made
 * it: a screen reader stops announcing the background while Tab walks straight
 * into it. So this moves focus in on open, cycles it at both edges, and
 * returns it to whatever opened the dialog on close.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  children?: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    /* Whatever had focus when the dialog opened, so it can be given back. */
    const opener = document.activeElement as HTMLElement | null

    /* First focusable inside the panel, falling back to the panel itself so
     * focus is never left on the document behind the scrim. */
    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)

    const initial = focusable()
    ;(initial[0] ?? panelRef.current)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-deep/25"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[90dvh] w-full animate-slide-up flex-col rounded-lg border border-gray-200 bg-white shadow-popover',
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-3xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold tracking-[-0.015em] text-gray-900">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
