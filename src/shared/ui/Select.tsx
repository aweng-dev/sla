import { forwardRef, type SelectHTMLAttributes } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[]
  /** Rendered as a disabled first option, so an unset value is visibly unset
   *  rather than silently the first item. */
  placeholder?: string
  invalid?: boolean
}

/** A native select, styled. Native because it is the only control that gets
 *  keyboard, screen-reader and mobile behaviour right for free, and Sprig's own
 *  simple selects look exactly like this. Multi-select filters use `Menu`. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, invalid, className, ...props },
  ref,
) {
  return (
    <div className="relative flex w-full items-center">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-8 w-full appearance-none rounded-md border bg-white pl-2.5 pr-7 text-sm text-gray-900',
          'transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
          invalid ? 'border-danger-500' : 'border-gray-300',
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <CaretDown
        size={11}
        weight="bold"
        className="pointer-events-none absolute right-2.5 text-gray-600"
      />
    </div>
  )
})
