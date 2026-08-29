import { type KeyboardEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CaretDown, CaretUp } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { Checkbox } from './Checkbox'
import { EmptyState } from './EmptyState'

/**
 * The dense table Sprig runs everywhere.
 *
 * Sampled proportions: a #faf8f4 header band — the one warm neutral in the
 * system — 12px header labels in secondary ink, 15px cells in primary ink,
 * ~48px rows, and a #efefef hairline under each. No zebra striping, no
 * vertical rules, no shadow. Numbers are tabular so columns line up.
 *
 * ── Why the columns are data and not JSX ───────────────────────────────────
 *
 * Because selection, sorting, the loading skeleton, the empty state and the
 * "no results for this filter" state all need to know how many columns there
 * are and which of them is the primary one. A table built from handwritten
 * <td>s makes each of those the caller's problem, and they get written five
 * different ways.
 */

export interface Column<T> {
  key: string
  header: ReactNode
  /** Right-align and tabular-nums. Use for money, counts, dates. */
  numeric?: boolean
  /** Sortable columns emit their key to `onSortChange`. */
  sortable?: boolean
  width?: string
  className?: string
  cell: (row: T, index: number) => ReactNode
}

export interface SortState {
  key: string
  direction: 'asc' | 'desc'
}

export interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  /** How many skeleton rows to draw while loading. Match the page size so the
   *  table does not resize when the real rows land. */
  skeletonRows?: number
  empty?: ReactNode
  /**
   * Where a row goes, as a URL.
   *
   * Strongly preferred over `onRowClick` alone. A `<tr onClick>` is invisible
   * to the keyboard, cannot be middle-clicked, cannot be opened in a new tab
   * and tells a screen reader nothing — and on a roster screen the row IS the
   * only way into a record. When this is given, the first column's content is
   * rendered inside a real anchor, which restores all four behaviours at once.
   */
  rowHref?: (row: T) => string
  /** For a row whose destination is not a URL. Supplies a keyboard path of its
   *  own when `rowHref` is absent. */
  onRowClick?: (row: T) => void
  sort?: SortState | null
  onSortChange?: (sort: SortState) => void
  /** Omit both to render a table with no selection column at all. */
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
  className?: string
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  skeletonRows = 8,
  empty,
  rowHref,
  onRowClick,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  className,
}: DataTableProps<T>) {
  const selectable = Boolean(selectedIds && onSelectionChange)
  const totalColumns = columns.length + (selectable ? 1 : 0)

  const allSelected =
    selectable && rows.length > 0 && rows.every((row) => selectedIds!.has(rowKey(row)))
  const someSelected =
    selectable && !allSelected && rows.some((row) => selectedIds!.has(rowKey(row)))

  function toggleAll() {
    if (!selectable) return
    const next = new Set(selectedIds!)
    if (allSelected) {
      for (const row of rows) next.delete(rowKey(row))
    } else {
      for (const row of rows) next.add(rowKey(row))
    }
    onSelectionChange!(next)
  }

  function toggleRow(id: string) {
    if (!selectable) return
    const next = new Set(selectedIds!)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange!(next)
  }

  function headerSort(column: Column<T>) {
    if (!column.sortable || !onSortChange) return
    const direction = sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ key: column.key, direction })
  }

  return (
    /*
     * Sprig's tables sit INSIDE a rounded, hairlined card with a gutter around
     * it — sampled at x=138..751 in a 768-wide capture whose rail ends at 122,
     * i.e. a 30px gutter at 1440. A table run flush to the canvas edges, which
     * is what this used to be, is the single most obvious way the screen stops
     * looking like Sprig: the card is what gives the data a shape.
     *
     * `overflow-hidden` so the #faf8f4 header band is clipped by the radius.
     */
    <div className={cn('w-full overflow-hidden rounded-lg border border-gray-200', className)}>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-200 bg-table-head">
            {selectable && (
              <th scope="col" className="w-11 px-4 py-3">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  aria-label={allSelected ? 'Clear selection' : 'Select all rows on this page'}
                />
              </th>
            )}
            {columns.map((column) => {
              const active = sort?.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={
                    active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'whitespace-nowrap px-3 py-2.5 text-2xs font-medium leading-4 text-gray-600',
                    column.numeric && 'text-right',
                    column.className,
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => headerSort(column)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded transition-colors hover:text-gray-900',
                        active && 'text-gray-900',
                      )}
                    >
                      {column.header}
                      {active ? (
                        sort!.direction === 'asc' ? (
                          <CaretUp size={12} weight="bold" />
                        ) : (
                          <CaretDown size={12} weight="bold" />
                        )
                      ) : (
                        <CaretDown size={12} className="text-gray-400" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {loading &&
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`skeleton-${i}`} className="border-b border-gray-200 last:border-b-0">
                {Array.from({ length: totalColumns }).map((__, j) => (
                  <td key={j} className="px-4 py-3.5">
                    <div className="h-3 w-full max-w-[10rem] animate-pulse rounded bg-gray-100" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={totalColumns} className="px-4 py-16">
                {empty ?? <EmptyState title="Nothing here yet" />}
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row, index) => {
              const id = rowKey(row)
              const selected = selectable && selectedIds!.has(id)

              const interactive = Boolean(rowHref || onRowClick)

              /* Only when there is no anchor to carry it. With `rowHref` the
               * first cell is already focusable and Enter already works, and a
               * second keyboard target on the same row would make every record
               * cost two tab stops. */
              const keyboardFallback =
                onRowClick && !rowHref
                  ? {
                      tabIndex: 0,
                      role: 'button' as const,
                      onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onRowClick(row)
                        }
                      },
                    }
                  : {}

              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  {...keyboardFallback}
                  className={cn(
                    'border-b border-gray-200 transition-colors last:border-b-0',
                    selected ? 'bg-accent-50' : 'hover:bg-gray-50',
                    interactive && 'cursor-pointer',
                  )}
                >
                  {selectable && (
                    <td className="w-11 px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected}
                        onChange={() => toggleRow(id)}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-3 py-3 text-sm leading-5 text-gray-900',
                        column.numeric && 'text-right tabular',
                        column.className,
                      )}
                    >
                      {rowHref && columnIndex === 0 ? (
                        <Link
                          to={rowHref(row)}
                          onClick={(event) => event.stopPropagation()}
                          className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
                        >
                          {column.cell(row, index)}
                        </Link>
                      ) : (
                        column.cell(row, index)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

/**
 * A cell with an optional muted second line.
 *
 * Use the second line SPARINGLY. Sprig's tables are single-line — a row is one
 * line of 15px text in a ~48px row — and stacking two lines in every row is
 * what turns a dense roster into a list of cards. If the secondary value has a
 * column of its own, put it there instead of under the name.
 */
export function CellStack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm leading-5 text-gray-900">{primary}</div>
      {secondary != null && secondary !== '' && (
        <div className="truncate text-2xs leading-4 text-gray-600">{secondary}</div>
      )}
    </div>
  )
}

/** A dash, not an empty cell. An empty cell reads as a rendering bug. */
export function Blank() {
  return <span className="text-gray-500">—</span>
}
