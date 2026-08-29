import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * ── The yellow is a FILL, never text ───────────────────────────────────────
 *
 * `primary` paints #f8d030 and sets the label to near-black ink. There is no
 * variant that renders yellow TEXT, and there must not be: #f8d030 on white is
 * roughly 1.6:1, which fails every contrast threshold there is. When something
 * needs to read as interactive in text, it uses `link` — the accent purple,
 * which was chosen precisely because it survives at 15px.
 *
 * ── Sprig's buttons ────────────────────────────────────────────────────────
 *
 * 36px tall at the default size, 15px semibold label, 8px radius, no shadow.
 * `secondary` is a white button with a hairline. Icon-to-label gap is 8px.
 * Create actions put the plus AFTER the label (`trailing`), matching
 * Sprig's "New Study +".
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'inverse'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-400 text-gray-900 hover:bg-brand-500 active:bg-brand-600 disabled:bg-brand-200 disabled:text-gray-500',
  secondary:
    'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-500 disabled:bg-white',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-400',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 disabled:bg-danger-200',
  link: 'bg-transparent text-accent-500 hover:text-accent-600 hover:underline underline-offset-2 px-0 h-auto',
  inverse: 'bg-ink-deep text-white hover:bg-gray-950 active:bg-gray-950',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-10 px-4 text-md gap-2 rounded-lg',
  icon: 'h-9 w-9 p-0 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Rendered before the label. Pass a Phosphor icon at `size={16}` `weight="bold"`. */
  icon?: ReactNode
  /** Rendered after the label — a plus on a create CTA, a caret, a count. */
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
        /* Semibold on every variant. Sprig sets its button labels heavier than
         * body text throughout, and a regular-weight secondary sitting beside
         * a medium primary reads as the disabled one. */
        'font-semibold transition-colors duration-100',
        'disabled:cursor-not-allowed',
        '[&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
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
