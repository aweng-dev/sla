import type { ReactNode } from 'react'
import { Check } from '@phosphor-icons/react'
import { FilterPill, Menu, Spinner } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'

/**
 * A filter pill that opens a list and sets one value.
 *
 * Single-select rather than Sprig's checkbox groups because the API takes one
 * `program_id` and one `learning_group_id`. A multi-select popover would let
 * somebody tick three classes and then quietly send the first, which is worse
 * than not offering the tick.
 *
 * Composed here rather than added to `shared/ui`: it is a filter shape, not a
 * primitive, and the primitives it is made of already exist.
 */
export interface FilterOption {
  value: string
  label: string
  /** A quiet second line — a class's code, a programme's abbreviation. */
  hint?: string
}

export function FilterSelect({
  label,
  anyLabel,
  options,
  value,
  onChange,
  loading = false,
  icon,
}: {
  label: string
  /** What the unset state is called: "Any class", "Any section". */
  anyLabel: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  loading?: boolean
  icon?: ReactNode
}) {
  const selected = options.find((option) => option.value === value)

  return (
    <Menu
      align="start"
      trigger={({ open, toggle, ref }) => (
        <FilterPill
          ref={ref}
          open={open}
          active={value !== ''}
          icon={icon}
          onClick={toggle}
          label={selected ? `${label}: ${selected.label}` : label}
        />
      )}
    >
      {(close) => (
        <div className="max-h-72 w-56 overflow-y-auto py-0.5">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600">
              <Spinner className="h-3.5 w-3.5" /> Loading
            </div>
          )}

          {!loading && options.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-600">Nothing to filter by yet</p>
          )}

          {!loading && options.length > 0 && (
            <>
              <FilterRow
                label={anyLabel}
                selected={value === ''}
                onSelect={() => {
                  onChange('')
                  close()
                }}
              />
              <div className="my-1 border-t border-gray-200" />
              {options.map((option) => (
                <FilterRow
                  key={option.value}
                  label={option.label}
                  hint={option.hint}
                  selected={option.value === value}
                  onSelect={() => {
                    onChange(option.value)
                    close()
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </Menu>
  )
}

function FilterRow({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string
  hint?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors hover:bg-gray-100"
    >
      <span className="min-w-0">
        <span className={cn('block truncate text-sm', selected ? 'text-gray-900' : 'text-gray-800')}>
          {label}
        </span>
        {hint && <span className="block truncate text-2xs text-gray-500">{hint}</span>}
      </span>
      {selected && <Check size={13} weight="bold" className="shrink-0 text-accent-500" />}
    </button>
  )
}
