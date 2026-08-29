import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Archive, PencilSimple, Plus } from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { formatNumber, humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Textarea,
  Toolbar,
  type Column,
  type MenuItemSpec,
} from '@/shared/ui'
import { programsApi, type ProgramPayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { actionsColumn } from './components/RowActions'
import { reportError, useServerErrors } from './components/useServerErrors'
import { useUnitCatalog } from './components/pickers'
import { useDebounced } from '@/shared/lib/useDebounced'
import { DURATION_UNITS, type Program } from './academics.types'

/**
 * What a learner is enrolled ON — a course of study spanning years.
 *
 * ── There is no delete, and that is correct ────────────────────────────────
 *
 * The API offers `POST /programs/{id}/archive` and no DELETE. A programme with
 * enrolments behind it cannot be removed without orphaning the records that
 * name it, and a graduate's transcript has to keep resolving the programme
 * they graduated from. Archiving is the honest operation, so it is the only one
 * offered.
 *
 * ── The organizational unit is conditional on the institution ──────────────
 *
 * `organizational_unit_id` places a programme under a faculty or department.
 * A school has no organizational chart — `/admin/organizational-units` answers
 * 404 RESOURCE_NOT_FOUND for one — so the field is drawn only when
 * `institution.supports_organizational_units` says the concept exists here.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  code: z.string().trim().min(1, 'Enter a code'),
  type: z.string().trim().optional(),
  qualification_type: z.string().trim().optional(),
  duration_value: z.string().optional(),
  duration_unit: z.string().optional(),
  credit_requirement: z.string().optional(),
  organizational_unit_id: z.string().optional(),
  description: z.string().optional(),
})

type ProgramValues = z.infer<typeof schema>

const BLANK: ProgramValues = {
  name: '',
  code: '',
  type: '',
  qualification_type: '',
  duration_value: '',
  duration_unit: 'years',
  credit_requirement: '',
  organizational_unit_id: '',
  description: '',
}

export function ProgramsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access } = useTenant()
  const queryClient = useQueryClient()

  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Program | null>(null)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('programs.manage')
  const supportsUnits = access?.institution.supports_organizational_units ?? false
  const units = useUnitCatalog(supportsUnits)

  const listQuery = { search: search || undefined, page }

  const query = useQuery({
    queryKey: academicsKeys.programs.list(listQuery),
    queryFn: () => programsApi.list({ ...listQuery, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const rows = query.data?.rows ?? []

  const typeSuggestions = useMemo(
    () => [...new Set(rows.map((row) => row.type).filter((v): v is string => Boolean(v)))],
    [rows],
  )

  const form = useForm<ProgramValues>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const applyServerErrors = useServerErrors(form)

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.programs.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: ProgramValues) => {
      const payload: ProgramPayload = {
        name: values.name.trim(),
        code: values.code.trim(),
        type: values.type?.trim() || null,
        qualification_type: values.qualification_type?.trim() || null,
        duration_value: values.duration_value ? Number(values.duration_value) : null,
        duration_unit: values.duration_value ? values.duration_unit || null : null,
        credit_requirement: values.credit_requirement ? Number(values.credit_requirement) : null,
        organizational_unit_id: values.organizational_unit_id || null,
        description: values.description?.trim() || null,
      }
      return editing ? programsApi.update(editing.id, payload) : programsApi.create(payload)
    },
    onSuccess: () => {
      settle(editing ? `${t('programme')} updated` : `${t('programme')} created`)
      close()
    },
    onError: applyServerErrors,
  })

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  function open(program: Program | null) {
    setEditing(program)
    setCreating(program === null)
    form.reset(
      program
        ? {
            name: program.name,
            code: program.code,
            type: program.type ?? '',
            qualification_type: program.qualification_type ?? '',
            duration_value: String(program.duration_value ?? ''),
            duration_unit: program.duration_unit ?? 'years',
            credit_requirement: String(program.credit_requirement ?? ''),
            organizational_unit_id: program.organizational_unit?.id ?? '',
            description: program.description ?? '',
          }
        : BLANK,
    )
  }

  function close() {
    setEditing(null)
    setCreating(false)
    form.reset(BLANK)
  }

  const columns = useMemo<Column<Program>[]>(
    () => [
      {
        key: 'name',
        header: t('programme'),
        cell: (row) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: 'code',
        header: 'Code',
        width: '8rem',
        cell: (row) => <span className="tabular text-gray-700">{row.code}</span>,
      },
      {
        key: 'type',
        header: 'Kind',
        width: '9rem',
        cell: (row) => <span className="text-gray-700">{humanize(row.type)}</span>,
      },
      {
        key: 'duration',
        header: 'Duration',
        width: '8rem',
        cell: (row) =>
          row.duration_value
            ? `${row.duration_value} ${row.duration_unit ?? ''}`.trim()
            : <span className="text-gray-500">—</span>,
      },
      {
        key: 'enrolled',
        header: t('learners'),
        numeric: true,
        width: '7rem',
        cell: (row) => formatNumber(row.enrollment_count),
      },
      {
        key: 'status',
        header: 'Status',
        width: '8rem',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      actionsColumn<Program>(
        (row) => row.name,
        (row) => {
          if (!canManage || !row.can_manage) return []
          const items: MenuItemSpec[] = [
            { key: 'edit', label: 'Edit', icon: <PencilSimple size={15} />, onSelect: () => open(row) },
          ]
          if (row.status !== 'archived') {
            items.push({
              key: 'archive',
              label: 'Archive',
              icon: <Archive size={15} />,
              separated: true,
              onSelect: () =>
                act.mutate({
                  run: () => programsApi.archive(row.id),
                  message: `${row.name} archived`,
                }),
            })
          }
          return items
        },
      ),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage],
  )

  return (
    <PageStack>
      <PageHeader
        title={t('programmes')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => open(null)}
            >
              New {t('programme').toLowerCase()}
            </Button>
          ) : undefined
        }
      />

      <Toolbar
        actions={
          <SearchInput
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setPage(1)
            }}
            placeholder={`Search ${t('programmes').toLowerCase()}`}
          />
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={4}
            empty={
              search ? (
                <EmptyState
                  title="No matches"
                  description={`Nothing matches “${search}”.`}
                  action={<Button onClick={() => setDraft('')}>Clear search</Button>}
                />
              ) : (
                <EmptyState
                  title={`No ${t('programmes').toLowerCase()} yet`}
                  description={`A ${t('programme').toLowerCase()} is what an enrolment points at. Add one before admitting anybody.`}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => open(null)}>
                        New {t('programme').toLowerCase()}
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}

      <FormDialog
        open={creating || editing !== null}
        onClose={close}
        title={editing ? `Edit ${editing.name}` : `New ${t('programme').toLowerCase()}`}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel={editing ? 'Save changes' : 'Create'}
      >
        <FieldRow>
          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(props) => (
              <Input {...props} placeholder="Junior Secondary" {...form.register('name')} />
            )}
          </Field>
          <Field label="Code" required error={form.formState.errors.code?.message}>
            {(props) => <Input {...props} placeholder="JSS" {...form.register('code')} />}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Kind" error={form.formState.errors.type?.message}>
            {(props) => (
              <>
                <Input
                  {...props}
                  list="program-types"
                  placeholder="certificate"
                  {...form.register('type')}
                />
                <datalist id="program-types">
                  {typeSuggestions.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field
            label="Qualification"
            error={form.formState.errors.qualification_type?.message}
          >
            {(props) => (
              <Input {...props} placeholder="secondary" {...form.register('qualification_type')} />
            )}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Duration" error={form.formState.errors.duration_value?.message}>
            {(props) => (
              <div className="flex gap-2">
                <Input
                  {...props}
                  type="number"
                  min={1}
                  placeholder="3"
                  {...form.register('duration_value')}
                />
                <Select
                  aria-label="Duration unit"
                  className="w-32"
                  options={DURATION_UNITS.map((value) => ({ value, label: humanize(value) }))}
                  {...form.register('duration_unit')}
                />
              </div>
            )}
          </Field>
          <Field
            label="Credits to graduate"
            error={form.formState.errors.credit_requirement?.message}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                placeholder="60"
                {...form.register('credit_requirement')}
              />
            )}
          </Field>
        </FieldRow>

        {supportsUnits && (
          <Field
            label={humanize(access?.institution.organizational_unit_noun ?? 'department')}
            error={form.formState.errors.organizational_unit_id?.message}
          >
            {(props) => (
              <Select
                {...props}
                options={[{ value: '', label: 'None' }, ...units.options]}
                {...form.register('organizational_unit_id')}
              />
            )}
          </Field>
        )}

        <Field label="Description" error={form.formState.errors.description?.message}>
          {(props) => <Textarea {...props} rows={3} {...form.register('description')} />}
        </Field>
      </FormDialog>
    </PageStack>
  )
}
