import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Drawn inside the field on the left. */
  icon?: ReactNode
  trailing?: ReactNode
  invalid?: boolean
  inputSize?: 'sm' | 'md'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, trailing, invalid, inputSize = 'md', className, ...props },
  ref,
) {
  return (
    <div className="relative flex w-full items-center">
      {icon && (
        <span className="pointer-events-none absolute left-2.5 flex text-gray-500" aria-hidden>
          {icon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'w-full rounded-md border bg-white text-gray-900 transition-colors',
          'placeholder:text-gray-500',
          'focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
          inputSize === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
          icon ? 'pl-8' : 'pl-2.5',
          trailing ? 'pr-8' : 'pr-2.5',
          invalid ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25' : 'border-gray-300',
          className,
        )}
        {...props}
      />
      {trailing && <span className="absolute right-2.5 flex text-gray-500">{trailing}</span>}
    </div>
  )
})

/** The toolbar search. Sprig puts it at the right of the filter row, never in
 *  the page header. */
export const SearchInput = forwardRef<HTMLInputElement, Omit<InputProps, 'icon' | 'type'>>(
  function SearchInput({ placeholder = 'Search', className, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="search"
        placeholder={placeholder}
        icon={<MagnifyingGlass size={14} weight="bold" />}
        className={cn('w-56 [&::-webkit-search-cancel-button]:appearance-none', className)}
        {...props}
      />
    )
  },
)
