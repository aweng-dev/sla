import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * ── The yellow is a FILL, never text ───────────────────────────────────────
 *
 * `primary` paints #f8d030 and sets the label to near-black ink. There is no
 * variant that renders yellow TEXT, and there must not be: #f8d030 on white is
 * roughly 1.6:1, which fails every contrast threshold there is. When something
 * needs to read as interactive in text, it uses `link` — the accent purple,
 * which was chosen precisely because it survives at 13px.
 *
 * ── Sprig's buttons are small ──────────────────────────────────────────────
 *
 * 32px tall at the default size, 13px medium label, 6px radius, and no shadow
 * on any of them. `secondary` is a white button with a hairline; the product
 * separates with hairlines rather than elevation throughout.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'inverse'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-400 text-gray-900 hover:bg-brand-500 active:bg-brand-600 disabled:bg-brand-200 disabled:text-gray-500 font-medium',
  secondary:
    'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-500 disabled:bg-white',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-400',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 disabled:bg-danger-200',
  link: 'bg-transparent text-accent-500 hover:text-accent-600 hover:underline underline-offset-2 px-0 h-auto',
  inverse: 'bg-ink-deep text-white hover:bg-gray-950 active:bg-gray-950',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded',
  md: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  lg: 'h-9 px-4 text-base gap-2 rounded-md',
  icon: 'h-8 w-8 p-0 rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Rendered before the label. Pass a Phosphor icon at `size={15}`. */
  icon?: ReactNode
  /** Rendered after the label — a chevron, a plus, a count. */
  trailing?: ReactNode
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    trailing,
    loading = false,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap',
        'transition-colors duration-100',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        icon
      )}
      {children}
      {trailing}
    </button>
  )
})
