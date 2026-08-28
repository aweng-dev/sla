import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from 'react'
import { Check, Minus } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Half-selected: some rows on this page are picked, not all. Set through
   *  the DOM property because HTML has no attribute for it. */
  indeterminate?: boolean
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { indeterminate = false, className, checked, disabled, ...props },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <span className={cn('relative inline-flex h-4 w-4 shrink-0', className)}>
      <input
        ref={(node) => {
          innerRef.current = node
          if (typeof forwardedRef === 'function') forwardedRef(node)
          else if (forwardedRef) forwardedRef.current = node
        }}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="peer h-4 w-4 cursor-pointer appearance-none rounded-sm border border-gray-400 bg-white transition-colors checked:border-brand-400 checked:bg-brand-400 indeterminate:border-brand-400 indeterminate:bg-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 disabled:cursor-not-allowed disabled:bg-gray-100"
        {...props}
      />
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-gray-900 opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100"
        aria-hidden
      >
        {indeterminate ? <Minus size={11} weight="bold" /> : <Check size={11} weight="bold" />}
      </span>
    </span>
  )
})
