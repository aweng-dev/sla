import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DownloadSimple, FileText, Trash, UploadSimple } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterPill,
  Menu,
  Modal,
  Pagination,
  SearchInput,
  Select,
  Textarea,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { PageHeader } from '@/shared/ui'
import { formatRelative, humanize } from '@/shared/lib/format'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { downloadDocument, toolsApi, toolsKeys } from './tools.api'
import type { DocumentCategory, DocumentRecord, DocumentVisibility } from './tools.types'

const CATEGORIES: DocumentCategory[] = ['identity', 'academic', 'medical', 'financial', 'policy', 'other']
const VISIBILITIES: DocumentVisibility[] = ['staff', 'students', 'guardians', 'public']

/**
 * The institution's file store.
 *
 * A document is a record plus a stack of VERSIONS — uploading again does not
 * replace the file, it adds a version — and `current_version` is what the row
 * describes. That is why the size and filename live under the version rather
 * than on the document itself.
 */
export function DocumentsPage() {
  const perms = usePermissions()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<DocumentCategory | ''>('')
  const [uploading, setUploading] = useState(false)

  const query = useQuery({
    queryKey: toolsKeys.documents({ page, search, category }),
    queryFn: () =>
      toolsApi.documents({ page, per_page: 25, search: search || undefined, category: category || undefined }),
    placeholderData: (prev) => prev,
  })

  const columns: Column<DocumentRecord>[] = [
    {
      key: 'title',
      header: 'Document',
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate text-sm text-gray-900">{row.title}</div>
          {row.current_version?.original_filename && (
            <div className="truncate text-2xs text-gray-600">
              {row.current_version.original_filename}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '9rem',
      cell: (row) =>
        row.category ? (
          <span className="text-gray-700">{humanize(row.category)}</span>
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
    {
      key: 'visibility',
      header: 'Visible to',
      width: '9rem',
      cell: (row) =>
        row.is_confidential ? (
          <Badge tone="danger">Confidential</Badge>
        ) : row.visibility ? (
          <Badge tone="neutral">{humanize(row.visibility)}</Badge>
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
    {
      key: 'version',
      header: 'Version',
      numeric: true,
      width: '6rem',
      cell: (row) => row.current_version?.version ?? <span className="text-gray-500">—</span>,
    },
    {
      key: 'size',
      header: 'Size',
      numeric: true,
      width: '7rem',
      cell: (row) =>
        row.current_version?.byte_size != null ? (
          bytes(row.current_version.byte_size)
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Added',
      width: '9rem',
      cell: (row) => <span className="text-gray-700">{formatRelative(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '4rem',
      cell: (row) => <RowActions doc={row} canManage={perms.has('document_management.manage')} />,
    },
  ]

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  const rows = query.data?.rows ?? []
  const filtered = search !== '' || category !== ''

  return (
    <PageStack>
      <PageHeader
        title="Documents"
        meta={query.data ? <span>{query.data.pagination.total} files</span> : undefined}
        actions={
          perms.has('document_management.manage') && (
            <Button
              variant="primary"
              icon={<UploadSimple size={14} weight="bold" />}
              onClick={() => setUploading(true)}
            >
              Upload
            </Button>
          )
        }
      />

      <div>
        <Toolbar
          filters={
            <>
              <SearchInput
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search documents"
                aria-label="Search documents"
                className="w-64"
              />
              <Menu
                align="start"
                items={[
                  { key: 'any', label: 'Any category', onSelect: () => setCategory('') },
                  ...CATEGORIES.map((c) => ({
                    key: c,
                    label: humanize(c),
                    onSelect: () => {
                      setCategory(c)
                      setPage(1)
                    },
                  })),
                ]}
                trigger={({ toggle, ref, open }) => (
                  <FilterPill
                    ref={ref as never}
                    label={category ? humanize(category) : 'Any category'}
                    open={open}
                    active={category !== ''}
                    onClick={toggle}
                  />
                )}
              />
            </>
          }
        />

        {!query.isLoading && rows.length === 0 ? (
          <EmptyState
            icon={<FileText size={20} />}
            title={filtered ? 'No document matches that' : 'No documents yet'}
            description={
              filtered
                ? 'Clear the filters to see everything in the store.'
                : 'Policies, letters, certificates — anything the institution needs to keep. Each upload is versioned, so replacing a file keeps the old one.'
            }
            action={
              filtered ? (
                <Button
                  onClick={() => {
                    setSearch('')
                    setCategory('')
                  }}
                >
                  Clear filters
                </Button>
              ) : perms.has('document_management.manage') ? (
                <Button
                  variant="primary"
                  icon={<UploadSimple size={14} weight="bold" />}
                  onClick={() => setUploading(true)}
                >
                  Upload a document
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
            />
            {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
          </>
        )}
      </div>

      <UploadDialog open={uploading} onClose={() => setUploading(false)} />
    </PageStack>
  )
}

function RowActions({ doc, canManage }: { doc: DocumentRecord; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  const remove = useMutation({
    mutationFn: () => toolsApi.removeDocument(doc.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Document deleted')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.rootMessage() : 'Could not delete it.'),
  })

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Download ${doc.title}`}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await downloadDocument(doc)
          } catch (e) {
            toast.error(e instanceof ApiError ? e.rootMessage() : 'Could not download it.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <DownloadSimple size={14} />
      </Button>
      {canManage && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Delete ${doc.title}`}
          loading={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <Trash size={14} />
        </Button>
      )}
    </div>
  )
}

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<DocumentCategory | ''>('')
  const [visibility, setVisibility] = useState<DocumentVisibility | ''>('')
  const [confidential, setConfidential] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('file', file as File)
      if (title.trim()) form.append('title', title.trim())
      if (description.trim()) form.append('description', description.trim())
      if (category) form.append('category', category)
      if (visibility) form.append('visibility', visibility)
      form.append('is_confidential', confidential ? '1' : '0')
      return toolsApi.upload(form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Uploaded')
      reset()
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

  function reset() {
    setFile(null)
    setTitle('')
    setDescription('')
    setCategory('')
    setVisibility('')
    setConfidential(false)
    setErrors({})
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Upload a document"
      description="Up to 50 MB. Uploading the same document again adds a version rather than replacing it."
      footer={
        <>
          <Button
            onClick={() => {
              reset()
              onClose()
            }}
            disabled={upload.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={upload.isPending}
            disabled={!file}
            onClick={() => {
              setErrors({})
              upload.mutate()
            }}
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="File" required error={errors.file}>
          {(props) => (
            <input
              {...props}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-900 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-gray-900"
            />
          )}
        </Field>
        <Field label="Title" error={errors.title} hint="Left blank, the filename is used.">
          {(props) => (
            <input
              {...props}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
          )}
        </Field>
        <Field label="Description" error={errors.description}>
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Category" error={errors.category}>
            {(props) => (
              <Select
                {...props}
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                options={[
                  { value: '', label: 'Uncategorised' },
                  ...CATEGORIES.map((c) => ({ value: c, label: humanize(c) })),
                ]}
              />
            )}
          </Field>
          <Field
            label="Visible to"
            error={errors.visibility}
            hint="Offered, not granted — every route re-checks its own permission."
          >
            {(props) => (
              <Select
                {...props}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}
                options={[
                  { value: '', label: 'Staff only' },
                  ...VISIBILITIES.map((v) => ({ value: v, label: humanize(v) })),
                ]}
              />
            )}
          </Field>
        </div>
        <label className="mt-1 flex items-start gap-2.5 rounded-md border border-gray-200 bg-gray-50 p-3">
          <input
            type="checkbox"
            checked={confidential}
            onChange={(e) => setConfidential(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm border-gray-400 accent-brand-400"
          />
          <span className="text-xs text-gray-700">
            <span className="font-medium text-gray-900">Confidential</span> — every read is written
            to the document&rsquo;s access log.
          </span>
        </label>
      </div>
    </Modal>
  )
}

function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
