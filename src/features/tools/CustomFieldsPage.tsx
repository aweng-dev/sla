import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, Plus, Tag } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
  Toolbar,
  panelId,
  type Column,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { PageHeader } from '@/shared/ui'
import { humanize } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { toolsApi, toolsKeys } from './tools.api'
import type { CustomField, CustomFieldRecordType, CustomFieldType } from './tools.types'

const RECORD_TYPES: CustomFieldRecordType[] = ['student', 'staff', 'application']
const FIELD_TYPES: CustomFieldType[] = ['text', 'long_text', 'number', 'date', 'boolean', 'select']

/**
 * Extending the records this product ships with.
 *
 * ── Why the record type is a tab and not a filter ──────────────────────────
 *
 * The API refuses a request without `record_type` — a field only means
 * anything against the record it extends, and there is deliberately no "all
 * custom fields" view. Making it a tab rather than an optional filter means
 * the screen can never be in the state the API rejects.
 */
export function CustomFieldsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const [recordType, setRecordType] = useState<CustomFieldRecordType>('student')
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const queryClient = useQueryClient()
  const baseId = 'custom-field-tabs'

  const query = useQuery({
    queryKey: toolsKeys.customFields(recordType, showArchived),
    queryFn: () => toolsApi.customFields(recordType, showArchived),
  })

  const archive = useMutation({
    mutationFn: (id: string) => toolsApi.archiveCustomField(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Field archived')
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.rootMessage() : 'Could not archive it.'),
  })

  const label = (r: CustomFieldRecordType) =>
    r === 'student' ? t('learner') : r === 'staff' ? 'Staff' : 'Application'

  const columns: Column<CustomField>[] = [
    {
      key: 'label',
      header: 'Field',
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate text-sm text-gray-900">{row.label}</div>
          {row.help_text && <div className="truncate text-2xs text-gray-600">{row.help_text}</div>}
        </div>
      ),
    },
    {
      key: 'key',
      header: 'Key',
      width: '12rem',
      cell: (row) => <code className="text-2xs text-gray-600">{row.key}</code>,
    },
    {
      key: 'field_type',
      header: 'Type',
      width: '8rem',
      cell: (row) => <span className="text-gray-700">{humanize(row.field_type)}</span>,
    },
    {
      key: 'required',
      header: 'Required',
      width: '7rem',
      cell: (row) =>
        row.is_required ? <Badge tone="neutral">Required</Badge> : <span className="text-gray-500">—</span>,
    },
    {
      key: 'state',
      header: 'State',
      width: '8rem',
      cell: (row) =>
        row.archived_at ? <Badge tone="outline">Archived</Badge> : <Badge tone="success">Live</Badge>,
    },
    {
      key: 'actions',
      header: '',
      width: '3.5rem',
      cell: (row) =>
        perms.has('customization.manage') && !row.archived_at ? (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Archive ${row.label}`}
            loading={archive.isPending && archive.variables === row.id}
            onClick={() => archive.mutate(row.id)}
          >
            <Archive size={14} />
          </Button>
        ) : null,
    },
  ]

  const rows = query.data ?? []

  return (
    <PageStack>
      <PageHeader
        title="Custom fields"
        meta={<span>{rows.length} on {label(recordType).toLowerCase()} records</span>}
        actions={
          perms.has('customization.manage') && (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => setCreating(true)}
            >
              New field
            </Button>
          )
        }
        tabs={
          <Tabs
            bare
            baseId={baseId}
            items={RECORD_TYPES.map((r) => ({ key: r, label: label(r) }))}
            value={recordType}
            onChange={(key) => setRecordType(key as CustomFieldRecordType)}
          />
        }
      />

      <div role="tabpanel" id={panelId(baseId, recordType)} aria-labelledby={`${baseId}-tab-${recordType}`}>
        <Toolbar
          filters={
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
          }
        />

        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !query.isLoading && rows.length === 0 ? (
          <EmptyState
            icon={<Tag size={20} />}
            title={`No custom fields on ${label(recordType).toLowerCase()} records`}
            description="A custom field adds something this product does not ship with — a house, a bus route, a sponsor reference. It appears on the record's form and in exports."
            action={
              perms.has('customization.manage') ? (
                <Button
                  variant="primary"
                  icon={<Plus size={14} weight="bold" />}
                  onClick={() => setCreating(true)}
                >
                  New field
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={5}
          />
        )}
      </div>

      <NewFieldDialog
        recordType={recordType}
        recordLabel={label(recordType)}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </PageStack>
  )
}

function NewFieldDialog({
  recordType,
  recordLabel,
  open,
  onClose,
}: {
  recordType: CustomFieldRecordType
  recordLabel: string
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [fieldType, setFieldType] = useState<CustomFieldType>('text')
  const [helpText, setHelpText] = useState('')
  const [required, setRequired] = useState(false)
  const [options, setOptions] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setLabel('')
    setKey('')
    setKeyTouched(false)
    setFieldType('text')
    setHelpText('')
    setRequired(false)
    setOptions('')
    setErrors({})
  }, [open])

  /* The key becomes a column name in exports, so it is derived from the label
   * until somebody edits it — and the API enforces `^[a-z][a-z0-9_]*$`. */
  useEffect(() => {
    if (keyTouched) return
    setKey(
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/^([0-9])/, 'f_$1'),
    )
  }, [label, keyTouched])

  const create = useMutation({
    mutationFn: () =>
      toolsApi.createCustomField({
        record_type: recordType,
        key: key.trim(),
        label: label.trim(),
        field_type: fieldType,
        help_text: helpText.trim() || null,
        is_required: required,
        options:
          fieldType === 'select'
            ? options.split('\n').map((o) => o.trim()).filter(Boolean)
            : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolsKeys.all })
      toast.success('Field created')
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The field could not be created.')
    },
  })

  const optionList = options.split('\n').map((o) => o.trim()).filter(Boolean)
  const ready = label.trim() && key.trim() && (fieldType !== 'select' || optionList.length > 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`New field on ${recordLabel.toLowerCase()} records`}
      description="It appears on the record's form and as a column in exports."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!ready}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Create field
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Label" required error={errors.label}>
          {(props) => (
            <Input
              {...props}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bus route"
              autoFocus
            />
          )}
        </Field>
        <Field
          label="Key"
          required
          error={errors.key}
          hint="Lower case, letters, digits and underscores. Becomes the column name in exports and cannot be changed."
        >
          {(props) => (
            <Input
              {...props}
              value={key}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(e.target.value)
              }}
              placeholder="bus_route"
            />
          )}
        </Field>
        <Field label="Type" required error={errors.field_type}>
          {(props) => (
            <Select
              {...props}
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
              options={FIELD_TYPES.map((f) => ({ value: f, label: humanize(f) }))}
            />
          )}
        </Field>
        {fieldType === 'select' && (
          <Field
            label="Options"
            required
            error={errors.options}
            hint={`One per line. ${optionList.length} so far.`}
          >
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder={'Route A\nRoute B\nWalks'}
              />
            )}
          </Field>
        )}
        <Field label="Help text" error={errors.help_text}>
          {(props) => (
            <Input {...props} value={helpText} onChange={(e) => setHelpText(e.target.value)} />
          )}
        </Field>
        <label className="mt-1 flex items-center gap-2.5">
          <Checkbox checked={required} onChange={(e) => setRequired(e.target.checked)} />
          <span className="text-sm text-gray-700">
            Required — the record cannot be saved without it
          </span>
        </label>
      </div>
    </Modal>
  )
}
