import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DownloadSimple, Export, Plus } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { formatNumber, formatRelative } from '@/shared/lib/format'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { downloadExport, isPending, reportKeys, reportsApi } from './reports.api'
import { ColumnPicker, ParameterFields } from './ParameterFields'
import { pruneParameters } from './reports.parameters'
import type { ExportRequest, ReportDatasetId, ReportFormat } from './reports.types'

/**
 * A one-off extract.
 *
 * The same datasets and the same filters as a report, with nothing saved.
 * Worth having as its own thing rather than making everybody create a
 * definition first: "give me the overdue invoices right now" is a different
 * act from "here is a question this institution asks every month", and
 * conflating them fills the report list with single-use rows.
 */
export function ExportsTab() {
  const perms = usePermissions()
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)

  const query = useQuery({
    queryKey: reportKeys.exports({ page }),
    queryFn: () => reportsApi.exports({ page, per_page: 25 }),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => {
      const rows = q.state.data?.rows ?? []
      return rows.some((row) => isPending(row.status)) ? 2000 : false
    },
  })

  const columns: Column<ExportRequest>[] = [
    {
      key: 'dataset',
      header: 'Dataset',
      cell: (row) => <span className="text-gray-900">{row.dataset_label}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      cell: (row) =>
        row.status === 'succeeded' ? (
          <Badge tone="success">{row.status_label}</Badge>
        ) : row.status === 'failed' ? (
          <Badge tone="danger">{row.status_label}</Badge>
        ) : (
          <Badge tone="neutral">{row.status_label}</Badge>
        ),
    },
    {
      key: 'rows',
      header: 'Rows',
      numeric: true,
      width: '7rem',
      cell: (row) =>
        row.row_count === null ? <span className="text-gray-500">—</span> : formatNumber(row.row_count),
    },
    {
      key: 'format',
      header: 'Format',
      width: '6rem',
      cell: (row) => <span className="uppercase text-gray-700">{row.format}</span>,
    },
    {
      key: 'created_at',
      header: 'Requested',
      width: '10rem',
      cell: (row) => <span className="text-gray-700">{formatRelative(row.created_at)}</span>,
    },
    {
      key: 'download',
      header: '',
      width: '8rem',
      cell: (row) => <DownloadCell record={row} />,
    },
  ]

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const isEmpty = !query.isLoading && (query.data?.rows.length ?? 0) === 0

  return (
    <>
      <Toolbar
        actions={
          perms.has('reports.manage') && (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => setCreating(true)}
            >
              New export
            </Button>
          )
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={<Export size={20} />}
          title="No exports yet"
          description="An export pulls a dataset out once, with the filters you choose, and leaves nothing behind. Use a report instead when it is a question you will ask again."
          action={
            perms.has('reports.manage') ? (
              <Button
                variant="primary"
                trailing={<Plus size={16} weight="bold" />}
                onClick={() => setCreating(true)}
              >
                New export
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            rows={query.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={5}
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}

      <NewExportDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function DownloadCell({ record }: { record: ExportRequest }) {
  const [busy, setBusy] = useState(false)

  if (record.status === 'failed') {
    return (
      <span className="text-2xs text-gray-600" title={record.error_message ?? undefined}>
        {record.error_message ? 'See the error' : '—'}
      </span>
    )
  }

  return (
    <Button
      size="sm"
      icon={<DownloadSimple size={13} />}
      disabled={!record.is_downloadable}
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await downloadExport(record)
        } catch (error) {
          toast.error(
            error instanceof ApiError ? error.rootMessage() : 'The file could not be downloaded.',
          )
        } finally {
          setBusy(false)
        }
      }}
    >
      Download
    </Button>
  )
}

function NewExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [datasetId, setDatasetId] = useState<ReportDatasetId | ''>('')
  const [format, setFormat] = useState<ReportFormat>('csv')
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [columns, setColumns] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const datasets = useQuery({
    queryKey: reportKeys.datasets(),
    queryFn: reportsApi.datasets,
    staleTime: Infinity,
    enabled: open,
  })

  const dataset = datasets.data?.find((d) => d.id === datasetId)

  useEffect(() => {
    setFilters({})
    setColumns([])
  }, [datasetId])

  useEffect(() => {
    if (!open) {
      setDatasetId('')
      setFormat('csv')
      setFilters({})
      setColumns([])
      setErrors({})
    }
  }, [open])

  const create = useMutation({
    mutationFn: () =>
      reportsApi.createExport({
        dataset: datasetId as ReportDatasetId,
        format,
        filters: pruneParameters(filters),
        columns: columns.length > 0 ? columns : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.exports() })
      toast.success('Queued. It will appear in the list when it finishes.')
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The export could not be started.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New export"
      description="A one-off extract. Nothing is saved."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={datasetId === '' || create.isPending}
            loading={create.isPending}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Start export
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        {datasets.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <Field label="Dataset" required error={errors.dataset} hint={dataset?.description}>
            {(props) => (
              <Select
                {...props}
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value as ReportDatasetId)}
                placeholder="Choose what to extract"
                options={(datasets.data ?? []).map((d) => ({ value: d.id, label: d.label }))}
              />
            )}
          </Field>
        )}

        <Field label="Format" error={errors.format}>
          {(props) => (
            <Select
              {...props}
              value={format}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              options={[
                { value: 'csv', label: 'CSV — spreadsheet file' },
                { value: 'json', label: 'JSON' },
              ]}
            />
          )}
        </Field>

        {dataset && (
          <>
            <div className="mt-2 border-t border-gray-200 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Filters</h3>
              <ParameterFields
                dataset={dataset}
                values={filters}
                errors={errors}
                disabled={create.isPending}
                onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
              />
            </div>

            <div className="mt-2 border-t border-gray-200 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Columns</h3>
              <ColumnPicker dataset={dataset} selected={columns} onChange={setColumns} />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
