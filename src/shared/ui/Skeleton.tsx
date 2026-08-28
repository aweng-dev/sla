import { cn } from '@/shared/lib/cn'

/** A grey block the size of the thing that is coming. Sized by the caller so
 *  the layout does not move when the real content lands. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-gray-100', className)} aria-hidden />
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-accent-500',
        className,
      )}
    />
  )
}
