import { DotsThree } from '@phosphor-icons/react'
import { Menu, type MenuItemSpec } from '@/shared/ui'

/**
 * The "…" menu at the end of a row.
 *
 * Extracted because nine list screens on this surface open the same control,
 * and the two details that are easy to get wrong are worth getting right once:
 * the trigger stops propagation so opening the menu on a clickable row does not
 * also navigate, and it carries a name so a screen reader announces which row
 * it belongs to rather than reading "button" thirty times.
 *
 * Renders nothing when there is nothing to offer — an empty menu is a control
 * that punishes the reader for using it.
 */
export function RowActions({ label, items }: { label: string; items: MenuItemSpec[] }) {
  if (items.length === 0) return null

  return (
    <Menu
      items={items}
      trigger={({ toggle, ref }) => (
        <button
          ref={ref as never}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            toggle()
          }}
          aria-label={`Actions for ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <DotsThree size={16} weight="bold" />
        </button>
      )}
    />
  )
}

/** The trailing column every list gives it, so the width and alignment agree
 *  across screens. */
export function actionsColumn<T>(
  label: (row: T) => string,
  items: (row: T) => MenuItemSpec[],
) {
  return {
    key: 'actions',
    header: '',
    width: '3rem',
    className: 'text-right',
    cell: (row: T) => <RowActions label={label(row)} items={items(row)} />,
  }
}
