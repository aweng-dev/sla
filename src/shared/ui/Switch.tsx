import { cn } from '@/shared/lib/cn'

/** On/off. The "on" fill is the accent rather than the yellow: a yellow track
 *  next to a white card does not read as "on" at 20px. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex w-8 shrink-0 items-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent-500' : 'bg-gray-300',
        className,
      )}
      style={{ height: '1.125rem' }}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform',
          checked ? 'translate-x-[1.0625rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
