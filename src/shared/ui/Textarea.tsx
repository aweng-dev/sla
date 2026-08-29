import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900',
        'placeholder:text-gray-500',
        'transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30',
        'disabled:cursor-not-allowed disabled:bg-gray-50',
        invalid ? 'border-danger-500' : 'border-gray-300',
        className,
      )}
      {...props}
    />
  )
})
