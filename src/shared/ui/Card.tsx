import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * A white panel on a white canvas, separated by a hairline.
 *
 * Sprig's canvas and cards are both #ffffff — sampled, not assumed. Nothing in
 * this product tints a card to lift it off the page, and nothing shadows one.
 * A card that needs to stand out gets a heavier hairline, not a fill.
 */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-gray-200 bg-white', className)}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="mt-0.5 truncate text-xs text-gray-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3', className)}
      {...props}
    />
  )
}
