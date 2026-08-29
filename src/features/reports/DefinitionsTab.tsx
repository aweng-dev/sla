import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChartBar, Plus } from '@phosphor-icons/react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  SearchInput,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { formatDate, formatRelative } from '@/shared/lib/format'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { reportKeys, reportsApi } from './reports.api'
import { NewReportDialog } from './NewReportDialog'
import type { ReportDefinition } from './reports.types'

/** Saved reports, as a roster. Search is client-side over the page because the
 *  API takes no `search` parameter here — see the note on the input. */
export function DefinitionsTab() {
  const perms = usePermissions()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)

  const query = useQuery({
    queryKey: reportKeys.list({ page }),
    queryFn: () => reportsApi.list({ page, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (prev) => prev,
  })

  const rows = (query.data?.rows ?? []).filter((row) =>
    filter.trim() === ''
      ? true
      : `${row.name} ${row.description ?? ''} ${row.dataset_label}`
          .toLowerCase()
          .includes(filter.trim().toLowerCase()),
  )

  const columns: Column<ReportDefinition>[] = [
    {
      key: 'name',
      header: 'Report',
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate text-sm text-gray-900">{row.name}</div>
          {row.description && (
            <div className="truncate text-2xs text-gray-600">{row.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'dataset',
      header: 'Dataset',
      cell: (row) => <span className="text-gray-700">{row.dataset_label}</span>,
    },
    {
      key: 'visibility',
      header: 'Visibility',
      width: '9rem',
      cell: (row) =>
        row.visibility === 'shared' ? (
          <Badge tone="neutral">Shared</Badge>
        ) : (
          <Badge tone="outline">Private</Badge>
        ),
    },
    {
      key: 'columns',
      header: 'Columns',
      numeric: true,
      width: '6rem',
      cell: (row) => row.effective_columns.length,
    },
    {
      key: 'last_run_at',
      header: 'Last run',
      width: '10rem',
      cell: (row) =>
        row.last_run_at ? (
          <span className="text-gray-700">{formatRelative(row.last_run_at)}</span>
        ) : (
          <span className="text-gray-500">Never</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Created',
      numeric: true,
      width: '9rem',
      cell: (row) => formatDate(row.created_at),
    },
  ]

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }

  const isEmpty = !query.isLoading && (query.data?.rows.length ?? 0) === 0

  return (
    <>
      <Toolbar
        filters={
          !isEmpty && (
            /* The endpoint takes no `search` parameter, so this narrows the
             * page that is already loaded rather than pretending to query the
             * server. Labelled accordingly. */
            <SearchInput
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter this page"
              aria-label="Filter reports on this page"
            />
          )
        }
        actions={
          perms.has('reports.manage') && (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => setCreating(true)}
            >
              New report
            </Button>
          )
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={<ChartBar size={20} />}
          title="No saved reports yet"
          description="A report is a dataset, a set of filters and the columns you want. Save one and you can run it whenever you like, share it, or have it emailed on a schedule."
          action={
            perms.has('reports.manage') ? (
              <Button
                variant="primary"
                trailing={<Plus size={16} weight="bold" />}
                onClick={() => setCreating(true)}
              >
                New report
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={6}
            rowHref={(row) => `/reports/${row.id}`}
            onRowClick={(row) => navigate({ to: '/reports/$reportId', params: { reportId: row.id } })}
            empty={
              <EmptyState
                title="No report matches that"
                description="Clear the filter to see the rest of this page."
              />
            }
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}

      <NewReportDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate({ to: '/reports/$reportId', params: { reportId: id } })}
      />
    </>
  )
}
