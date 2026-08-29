import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import type { Pagination as PaginationMeta } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { Button } from './Button'

/**
 * Page controls plus the count.
 *
 * The count matters more than the controls: "1–25 of 1,204" is how somebody
 * checks that a filter did what they meant. `from` and `to` are null on an
 * empty page, which is why they are not derived from `current_page`.
 */
export function Pagination({
  pagination,
  onPageChange,
  className,
}: {
  pagination: PaginationMeta
  onPageChange: (page: number) => void
  className?: string
}) {
  const { current_page, last_page, from, to, total } = pagination

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 py-3 ${className ?? ''}`}>
      <p className="text-sm text-gray-600">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            <span className="tabular text-gray-900">
              {formatNumber(from ?? 0)}–{formatNumber(to ?? 0)}
            </span>{' '}
            of <span className="tabular text-gray-900">{formatNumber(total)}</span>
          </>
        )}
      </p>

      {last_page > 1 && (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            icon={<CaretLeft size={14} weight="bold" />}
            disabled={current_page <= 1}
            onClick={() => onPageChange(current_page - 1)}
          >
            Previous
          </Button>
          <span className="px-1 text-sm text-gray-600 tabular">
            {current_page} / {last_page}
          </span>
          <Button
            size="sm"
            trailing={<CaretRight size={14} weight="bold" />}
            disabled={current_page >= last_page}
            onClick={() => onPageChange(current_page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
