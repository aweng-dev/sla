import { useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * A hover label on the inverted surface.
 *
 * Used by the collapsed rail, where the nav labels are gone and the icon is
 * the only thing left — without this, a collapsed sidebar is unusable to
 * anyone who has not memorised the order.
 */
export function Tooltip({
  content,
  side = 'right',
  children,
  className,
}: {
  content: ReactNode
  side?: 'right' | 'top' | 'bottom'
  children: ReactNode
  className?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-[60] animate-fade-in whitespace-nowrap rounded bg-ink-deep px-2 py-1 text-2xs font-medium text-white shadow-float',
            side === 'right' && 'left-full top-1/2 ml-2 -translate-y-1/2',
            side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
            side === 'bottom' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
