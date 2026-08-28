import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { PencilSimple, Plus, Trash, UsersThree } from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { formatNumber } from '@/shared/lib/format'
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
  Toolbar,
  type Column,
  type MenuItemSpec,
} from '@/shared/ui'
import { learningGroupsApi, type LearningGroupPayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { actionsColumn } from './components/RowActions'
import { reportError, useServerErrors } from './components/useServerErrors'
import {
  FilterSelect,
  useLevelCatalog,
  usePeriodCatalog,
  useProgramCatalog,
  useSessionCatalog,
} from './components/pickers'
import { useDebounced } from '@/shared/lib/useDebounced'
import type { LearningGroup } from './academics.types'

/**
 * Classes, cohorts, sets — the group a learner sits in.
 *
 * ── Occupancy is the column people come here for ───────────────────────────
 *
 * A registrar opening this screen is nearly always asking "where is there
 * room?". `occupancy` and `capacity` are both on the row and `has_space` is the
 * server's own answer, so the column reads "35 / 40" without the client
 * working out whether that is full. A null capacity means uncapped and the
 * server keeps `has_space` true for it — which is exactly why this must not be
 * computed here.
 *
 * ── Filtered by session, because a class belongs to one ────────────────────
 *
 * "JSS 1A" exists once per session. Unfiltered, this lists every JSS 1A the
 * institution has ever run, so it opens on the current session.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  code: z.string().trim().min(1, 'Enter a code'),
  type: z.string().trim().min(1, 'Enter a kind'),
  capacity: z.string().optional(),
  academic_session_id: z.string().optional(),
  academic_period_id: z.string().optional(),
  academic_level_id: z.string().optional(),
  program_id: z.string().optional(),
})

type GroupValues = z.infer<typeof schema>

export function LearningGroupsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access } = useTenant()
  const queryClient = useQueryClient()

  const currentSessionId = access?.calendar?.session?.id ?? ''
  const [sessionId, setSessionId] = useState(currentSessionId)
  const [levelId, setLevelId] = useState('')
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<LearningGroup | null>(null)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('learning_groups.manage')
  const sessions = useSessionCatalog()
  const periods = usePeriodCatalog()
  const levels = useLevelCatalog()
  const programs = useProgramCatalog()

  const listQuery = {
    academic_session_id: sessionId || undefined,
    academic_level_id: levelId || undefined,
    search: search || undefined,
    page,
  }

  const query = useQuery({
    queryKey: academicsKeys.groups.list(listQuery),
    queryFn: () => learningGroupsApi.list({ ...listQuery, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const rows = query.data?.rows ?? []

  const blank: GroupValues = {
    name: '',
    code: '',
    type: access?.institution.vocabulary === 'school' ? 'class' : 'cohort',
    capacity: '',
    academic_session_id: sessionId || currentSessionId,
    academic_period_id: '',
    academic_level_id: '',
    program_id: '',
  }

  const form = useForm<GroupValues>({ resolver: zodResolver(schema), defaultValues: blank })
  const applyServerErrors = useServerErrors(form)

  const typeSuggestions = useMemo(
    () => [...new Set(rows.map((row) => row.type).filter(Boolean))],
    [rows],
  )

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.groups.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: GroupValues) => {
      const payload: LearningGroupPayload = {
        name: values.name.trim(),
        code: values.code.trim(),
        type: values.type.trim(),
        capacity: values.capacity ? Number(values.capacity) : null,
        academic_session_id: values.academic_session_id || null,
        academic_period_id: values.academic_period_id || null,
        academic_level_id: values.academic_level_id || null,
        program_id: values.program_id || null,
      }
      return editing
        ? learningGroupsApi.update(editing.id, payload)
        : learningGroupsApi.create(payload)
    },
    onSuccess: () => {
      settle(editing ? `${t('group')} updated` : `${t('group')} created`)
      close()
    },
    onError: applyServerErrors,
  })

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  function open(group: LearningGroup | null) {
    setEditing(group)
    setCreating(group === null)
    form.reset(
      group
        ? {
            name: group.name,
            code: group.code,
            type: group.type,
            capacity: String(group.capacity ?? ''),
            academic_session_id: group.academic_session_id ?? '',
            academic_period_id: group.academic_period_id ?? '',
            academic_level_id: group.academic_level_id ?? '',
            program_id: group.program_id ?? '',
          }
        : blank,
    )
  }

  function close() {
    setEditing(null)
    setCreating(false)
    form.reset(blank)
  }

  const columns = useMemo<Column<LearningGroup>[]>(
    () => [
      {
        key: 'name',
        header: t('group'),
        cell: (row) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: 'code',
        header: 'Code',
        width: '8rem',
        cell: (row) => <span className="tabular text-gray-700">{row.code}</span>,
      },
      {
        key: 'level',
        header: t('level'),
        width: '9rem',
        cell: (row) => <span className="text-gray-700">{row.academic_level_name ?? '—'}</span>,
      },
      {
        key: 'tutor',
        header: t('classTeacher'),
        width: '12rem',
        cell: (row) => <span className="text-gray-700">{row.form_tutor?.name ?? '—'}</span>,
      },
      {
        key: 'occupancy',
        header: 'On roll',
        numeric: true,
        width: '8rem',
        cell: (row) => (
          <span className={row.capacity !== null && !row.has_space ? 'text-danger-500' : undefined}>
            {formatNumber(row.occupancy)}
            {row.capacity !== null && (
              <span className="text-gray-500"> / {formatNumber(row.capacity)}</span>
            )}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '8rem',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      actionsColumn<LearningGroup>(
        (row) => row.name,
        (row) => {
          if (!canManage) return []
          const items: MenuItemSpec[] = [
            { key: 'edit', label: 'Edit', icon: <PencilSimple size={15} />, onSelect: () => open(row) },
          ]
          /* Only an empty group can go. One with members would strand them. */
          if (row.occupancy === 0) {
            items.push({
              key: 'delete',
              label: 'Delete',
              icon: <Trash size={15} />,
              destructive: true,
              separated: true,
              onSelect: () =>
                act.mutate({
                  run: () => learningGroupsApi.remove(row.id),
                  message: `${row.name} deleted`,
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

  const filtered = Boolean(search || levelId || sessionId)

  return (
    <PageStack>
      <PageHeader
        title={t('groups')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => open(null)}
            >
              New {t('group').toLowerCase()}
            </Button>
          ) : undefined
        }
      />

      <Toolbar
        filters={
          <>
            <FilterSelect
              value={sessionId}
              onChange={(value) => {
                setSessionId(value)
                setPage(1)
              }}
              options={sessions.options}
              allLabel={`All ${t('sessions').toLowerCase()}`}
              className="w-52"
            />
            <FilterSelect
              value={levelId}
              onChange={(value) => {
                setLevelId(value)
                setPage(1)
              }}
              options={levels.options}
              allLabel={`All ${t('levels').toLowerCase()}`}
              className="w-48"
            />
          </>
        }
        actions={
          <SearchInput
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setPage(1)
            }}
            placeholder={`Search ${t('groups').toLowerCase()}`}
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
            skeletonRows={5}
            empty={
              filtered ? (
                <EmptyState
                  icon={<UsersThree size={20} />}
                  title="No matches"
                  description="Nothing matches these filters."
                  action={
                    <Button
                      onClick={() => {
                        setDraft('')
                        setLevelId('')
                        setSessionId('')
                        setPage(1)
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<UsersThree size={20} />}
                  title={`No ${t('groups').toLowerCase()} yet`}
                  description={`A ${t('group').toLowerCase()} is what a register is taken for. Add one and ${t('learners').toLowerCase()} can be placed in it.`}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => open(null)}>
                        New {t('group').toLowerCase()}
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
        title={editing ? `Edit ${editing.name}` : `New ${t('group').toLowerCase()}`}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel={editing ? 'Save changes' : 'Create'}
      >
        <FieldRow>
          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(props) => <Input {...props} placeholder="JSS 1A" {...form.register('name')} />}
          </Field>
          <Field label="Code" required error={form.formState.errors.code?.message}>
            {(props) => <Input {...props} placeholder="JSS1-A" {...form.register('code')} />}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Kind" required error={form.formState.errors.type?.message}>
            {(props) => (
              <>
                <Input {...props} list="group-types" placeholder="class" {...form.register('type')} />
                <datalist id="group-types">
                  {typeSuggestions.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field
            label="Capacity"
            hint="Leave blank for no limit"
            error={form.formState.errors.capacity?.message}
          >
            {(props) => (
              <Input {...props} type="number" min={1} placeholder="40" {...form.register('capacity')} />
            )}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label={t('session')} error={form.formState.errors.academic_session_id?.message}>
            {(props) => (
              <Select
                {...props}
                options={[{ value: '', label: 'None' }, ...sessions.options]}
                {...form.register('academic_session_id')}
              />
            )}
          </Field>
          <Field label={t('period')} error={form.formState.errors.academic_period_id?.message}>
            {(props) => (
              <Select
                {...props}
                options={[{ value: '', label: 'None' }, ...periods.options]}
                {...form.register('academic_period_id')}
              />
            )}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label={t('level')} error={form.formState.errors.academic_level_id?.message}>
            {(props) => (
              <Select
                {...props}
                options={[{ value: '', label: 'None' }, ...levels.options]}
                {...form.register('academic_level_id')}
              />
            )}
          </Field>
          <Field label={t('programme')} error={form.formState.errors.program_id?.message}>
            {(props) => (
              <Select
                {...props}
                options={[{ value: '', label: 'None' }, ...programs.options]}
                {...form.register('program_id')}
              />
            )}
          </Field>
        </FieldRow>
      </FormDialog>
    </PageStack>
  )
}
