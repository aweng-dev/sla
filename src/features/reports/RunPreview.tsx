import { useQuery } from '@tanstack/react-query'
import { DataTable, EmptyState, ErrorState, type Column } from '@/shared/ui'
import { formatNumber } from '@/shared/lib/format'
import { fetchRunRows, reportKeys, type ReportRow } from './reports.api'
import { columnLabel } from './ParameterFields'
import type { ReportRun } from './reports.types'

/**
 * The rows of a finished run, on the screen that asked for them.
 *
 * ── Why this is worth having ───────────────────────────────────────────────
 *
 * A CSV run can only be downloaded and opened somewhere else, which means the
 * answer to "did that filter do what I meant?" costs a round trip through a
 * spreadsheet. A JSON run comes back as an array of row objects, so the same
 * question is answered in place. That is the whole reason the run dialog
 * offers a format at all.
 *
 * Only the first `LIMIT` rows are rendered. A hundred-thousand-row report is a
 * legitimate thing to produce and an illegitimate thing to put in the DOM; the
 * count and the download stay honest about the rest.
 */
const LIMIT = 200

export function RunPreview({ run }: { run: ReportRun }) {
  const enabled = run.format === 'json' && run.status === 'succeeded' && run.is_downloadable

  const query = useQuery({
    queryKey: reportKeys.runRows(run.id),
    queryFn: () => fetchRunRows(run.id),
    enabled,
    /* The file is immutable once written and expires on its own. */
    staleTime: Infinity,
  })

  if (!enabled) {
    if (run.format !== 'json') {
      return (
        <EmptyState
          title="This run was produced as a file"
          description="Download it to read the rows. Run the report again as JSON to read them here instead."
        />
      )
    }
    if (!run.is_downloadable) {
      return (
        <EmptyState
          title="The result is no longer available"
          description="Report files are kept for a limited time and this one has expired. Run it again to get a fresh copy."
        />
      )
    }
    return null
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }

  const rows = query.data ?? []
  const columnKeys = run.columns.length > 0 ? run.columns : Object.keys(rows[0] ?? {})

  const columns: Column<ReportRow>[] = columnKeys.map((key) => ({
    key,
    header: columnLabel(key),
    numeric: isNumericColumn(key),
    cell: (row) => renderCell(row[key], key),
  }))

  if (!query.isLoading && rows.length === 0) {
    return (
      <EmptyState
        title="The report ran, and matched nothing"
        description="That is an answer, not a failure — no record met these filters."
      />
    )
  }

  return (
    <>
      <DataTable
        rows={rows.slice(0, LIMIT)}
        columns={columns}
        rowKey={(row) => String(columnKeys.map((k) => row[k]).join('|'))}
        loading={query.isLoading}
        skeletonRows={8}
      />
      {rows.length > LIMIT && (
        <p className="px-3 py-2 text-xs text-gray-600">
          Showing the first {formatNumber(LIMIT)} of {formatNumber(rows.length)} rows.
          Download the run for all of them.
        </p>
      )}
    </>
  )
}

/** Money and counts right-align; identifiers and names do not. */
function isNumericColumn(key: string): boolean {
  return (
    key.endsWith('_minor') ||
    key.endsWith('_count') ||
    key.endsWith('_percentage') ||
    key === 'days_overdue' ||
    key === 'sessions_total'
  )
}

function renderCell(value: string | number | null, key: string) {
  if (value === null || value === '') return <span className="text-gray-500">—</span>

  /* `*_minor` is an integer in the currency's smallest unit. The row does not
   * carry its own currency for every dataset, so this formats the number and
   * leaves the symbol to the column heading rather than inventing one. */
  if (key.endsWith('_minor') && typeof value === 'number') {
    return formatNumber(value / 100)
  }

  if (key.endsWith('_percentage') && typeof value === 'number') {
    return `${formatNumber(value)}%`
  }

  return String(value)
}
