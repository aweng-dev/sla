import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowsLeftRight, CheckCircle, Trash, UploadSimple, Warning } from '@phosphor-icons/react'
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
  Tabs,
  Toolbar,
  panelId,
  type Column,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { PageHeader } from '@/shared/ui'
import { formatNumber, formatRelative, humanize } from '@/shared/lib/format'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { toolsApi, toolsKeys } from './tools.api'
import { ExportsTab } from '@/features/reports/ExportsTab'
import type { ImportEntity, ImportJob, ImportRow } from './tools.types'

const ENTITIES: ImportEntity[] = ['students', 'staff', 'courses']

/**
 * Bulk in, bulk out.
 *
 * ── An import is two steps, and that is the point ──────────────────────────
 *
 * Uploading VALIDATES; nothing is written until the job is committed. So the
 * screen has to make the intermediate state legible — how many rows parsed,
 * how many are bad, and what is wrong with them — because that pause is the
 * whole value of the feature over pasting into the database.
 *
 * The export half is the same subsystem the Reports screen exposes, so it
 * reuses that component rather than growing a second one that drifts.
 */
export function ImportExportPage() {
  const perms = usePermissions()
  const [tab, setTab] = useState<'imports' | 'exports'>('imports')
  const baseId = 'import-export-tabs'

  return (
    <PageStack>
      <PageHeader
        title="Import and export"
        tabs={
          <Tabs
            bare
            baseId={baseId}
            items={[
              { key: 'imports', label: 'Imports' },
              { key: 'exports', label: 'Exports' },
            ]}
            value={tab}
            onChange={(key) => setTab(key as typeof tab)}
          />
        }
      />

      <div role="tabpanel" id={panelId(baseId, tab)} aria-labelledby={`${baseId}-tab-${tab}`}>
        {tab === 'imports' ? <ImportsTab canManage={perms.has('import_export.manage')} /> : <ExportsTab />}
      </div>
    </PageStack>
  )
}

function ImportsTab({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [inspecting, setInspecting] = useState<ImportJob | null>(null)

  const query = useQuery({
    queryKey: toolsKeys.imports({ page }),
    queryFn: () => toolsApi.imports({ page, per_page: 25 }),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => {
      const rows = q.state.data?.rows ?? []
      return rows.some((r) => r.status === 'queued' || r.status === 'running' || r.status === 'validating')
        ? 2000
        : false
    },
  })

  const columns: Column<ImportJob>[] = [
    {
      key: 'entity',
      header: 'Records',
      cell: (row) => (
        <div className="min-w-0">
          <div className="text-sm text-gray-900">{humanize(row.entity)}</div>
          {row.original_filename && (
            <div className="truncate text-2xs text-gray-600">{row.original_filename}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '10rem',
      cell: (row) => <ImportStatusBadge status={row.status} committed={Boolean(row.committed_at)} />,
    },
    {
      key: 'rows',
      header: 'Rows',
      numeric: true,
      width: '7rem',
      cell: (row) =>
        row.total_rows == null ? <span className="text-gray-500">—</span> : formatNumber(row.total_rows),
    },
    {
      key: 'invalid',
      header: 'Problems',
      numeric: true,
      width: '8rem',
      cell: (row) =>
        row.invalid_rows == null ? (
          <span className="text-gray-500">—</span>
        ) : row.invalid_rows > 0 ? (
          <span className="font-medium text-danger-500 tabular">{formatNumber(row.invalid_rows)}</span>
        ) : (
          <span className="text-gray-500 tabular">0</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Uploaded',
      width: '9rem',
      cell: (row) => <span className="text-gray-700">{formatRelative(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '9rem',
      cell: (row) => (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setInspecting(row)}>
            {row.committed_at ? 'View rows' : 'Review'}
          </Button>
        </div>
      ),
    },
  ]

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const rows = query.data?.rows ?? []

  return (
    <>
      <Toolbar
        actions={
          canManage && (
            <Button
              variant="primary"
              icon={<UploadSimple size={14} weight="bold" />}
              onClick={() => setUploading(true)}
            >
              New import
            </Button>
          )
        }
      />

      {!query.isLoading && rows.length === 0 ? (
        <EmptyState
          icon={<ArrowsLeftRight size={20} />}
          title="No imports yet"
          description="Upload a CSV of learners, staff or courses. It is checked row by row and nothing is written until you commit it."
          action={
            canManage ? (
              <Button
                variant="primary"
                icon={<UploadSimple size={14} weight="bold" />}
                onClick={() => setUploading(true)}
              >
                New import
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
            skeletonRows={5}
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}

      <NewImportDialog open={uploading} onClose={() => setUploading(false)} />
      {inspecting && (
        <ImportReviewDialog job={inspecting} open onClose={() => setInspecting(null)} canManage={canManage} />
      )}
    </>
  )
}

function ImportStatusBadge({ status, committed }: { status: string; committed: boolean }) {
  if (committed) return <Badge tone="success">Committed</Badge>
  if (status === 'failed') return <Badge tone="danger">Failed</Badge>
  if (status === 'queued' || status === 'running' || status === 'validating') {
    return <Badge tone="neutral">{humanize(status)}</Badge>
  }
  return <Badge tone="warning">Awaiting commit</Badge>
}

function NewImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [entity, setEntity] = useState<ImportEntity>('students')
  const [file, setFile] = useState<File | null>(null)
  const [onDuplicate, setOnDuplicate] = useState('skip')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('entity', entity)
      form.append('file', file as File)
      form.append('on_duplicate', onDuplicate)
      return toolsApi.createImport(form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Uploaded and being checked')
      setFile(null)
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The upload failed.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New import"
      description="A CSV. It is checked first — nothing is written until you commit."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!file}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Upload and check
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="What is in the file" required error={errors.entity}>
          {(props) => (
            <Select
              {...props}
              value={entity}
              onChange={(e) => setEntity(e.target.value as ImportEntity)}
              options={ENTITIES.map((x) => ({ value: x, label: humanize(x) }))}
            />
          )}
        </Field>
        <Field label="File" required error={errors.file} hint="CSV only.">
          {(props) => (
            <input
              {...props}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-900 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-gray-900"
            />
          )}
        </Field>
        <Field
          label="If a record already exists"
          error={errors.on_duplicate}
          hint={
            onDuplicate === 'skip'
              ? 'The row is left alone and the rest of the file still imports.'
              : 'The whole import is refused, so a duplicate cannot slip through unnoticed.'
          }
        >
          {(props) => (
            <Select
              {...props}
              value={onDuplicate}
              onChange={(e) => setOnDuplicate(e.target.value)}
              options={[
                { value: 'skip', label: 'Skip that row' },
                { value: 'fail', label: 'Refuse the whole file' },
              ]}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

function ImportReviewDialog({
  job,
  open,
  onClose,
  canManage,
}: {
  job: ImportJob
  open: boolean
  onClose: () => void
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const rows = useQuery({
    queryKey: toolsKeys.importRows(job.id),
    queryFn: () => toolsApi.importRows(job.id, { per_page: 50 }),
    enabled: open,
  })

  const commit = useMutation({
    mutationFn: () => toolsApi.commitImport(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Import committed')
      onClose()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.rootMessage() : 'The commit failed.'),
  })

  const discard = useMutation({
    mutationFn: () => toolsApi.discardImport(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Import discarded')
      onClose()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.rootMessage() : 'Could not discard it.'),
  })

  const list = rows.data?.rows ?? []
  const bad = list.filter((r) => r.is_valid === false)
  const committed = Boolean(job.committed_at)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${humanize(job.entity)} import`}
      description={
        committed
          ? 'Already committed. These are the rows as they were checked.'
          : 'Nothing has been written yet. Commit to apply the valid rows.'
      }
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {!committed && canManage && (
            <>
              <Button
                variant="danger"
                icon={<Trash size={13} />}
                loading={discard.isPending}
                onClick={() => discard.mutate()}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                icon={<CheckCircle size={13} weight="fill" />}
                loading={commit.isPending}
                disabled={(job.valid_rows ?? 0) === 0}
                onClick={() => commit.mutate()}
              >
                Commit {formatNumber(job.valid_rows ?? 0)} rows
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Figure label="Rows in file" value={formatNumber(job.total_rows)} />
        <Figure label="Will import" value={formatNumber(job.valid_rows)} />
        <Figure
          label="Problems"
          value={formatNumber(job.invalid_rows)}
          tone={(job.invalid_rows ?? 0) > 0 ? 'bad' : undefined}
        />
      </div>

      {rows.isError ? (
        <ErrorState error={rows.error} onRetry={() => rows.refetch()} />
      ) : bad.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={20} className="text-success-500" />}
          title="Every row checks out"
          description={committed ? undefined : 'Commit to write them.'}
        />
      ) : (
        <>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-700">
            <Warning size={13} className="text-danger-500" />
            {formatNumber(bad.length)} row{bad.length === 1 ? '' : 's'} will be skipped
          </p>
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
            {bad.slice(0, 30).map((row: ImportRow) => (
              <li key={row.id} className="px-3 py-2">
                <p className="text-2xs tabular text-gray-600">Row {row.row_number}</p>
                <ul className="mt-0.5 space-y-0.5">
                  {(row.errors ?? []).map((err, i) => (
                    <li key={i} className="text-sm text-danger-500">
                      {err.field ? <span className="text-gray-700">{err.field}: </span> : null}
                      {err.message}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p
        className={
          tone === 'bad'
            ? 'mt-0.5 text-lg font-semibold tabular text-danger-500'
            : 'mt-0.5 text-lg font-semibold tabular text-gray-900'
        }
      >
        {value}
      </p>
    </div>
  )
}
