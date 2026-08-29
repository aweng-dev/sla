import { cn } from '@/shared/lib/cn'

/**
 * Sprig's scope switch — the `All Mobbin | You` pair at the top right of the
 * Activity card.
 *
 * Two or three mutually exclusive views of the SAME list, which is what makes
 * it a segmented control rather than a filter: a filter narrows a list and says
 * so with a pill, a scope swaps which list you are looking at. The chosen one
 * takes the rail's own #eeeeee fill; the others are plain grey text. No border
 * around the group, no track, no colour — Sprig draws neither.
 *
 * ── Buttons, not a radiogroup ──────────────────────────────────────────────
 *
 * `role="radiogroup"` would promise roving focus and arrow-key selection, and
 * two segments do not earn that machinery. A group of toggle buttons is the
 * honest markup: each is a tab stop, and `aria-pressed` says which is on.
 */
export interface SegmentedOption {
  value: string
  label: string
  /** A trailing count, as Sprig shows on its tabs. Zero is not drawn — an
   *  empty scope should read as empty, not as a nought to interpret. */
  count?: number
}

export function Segmented({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: SegmentedOption[]
  /** Names the group for a screen reader, since the segments alone do not say
   *  what they are segmenting. */
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-0.5', className)}>
      {options.map((option) => {
        const active = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
              active
                ? 'bg-rail-active font-semibold text-gray-900'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span className={cn('tabular', active ? 'text-gray-700' : 'text-gray-500')}>
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
