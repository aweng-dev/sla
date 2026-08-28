import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { PencilSimple, Plus, SignOut } from '@phosphor-icons/react'
import { getPage, PER_PAGE_DEFAULT } from '@/shared/api/client'
import { humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
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
import { enrollmentsApi, params, type EnrollmentPayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { actionsColumn } from './components/RowActions'
import { reportError, useServerErrors } from './components/useServerErrors'
import {
  FilterSelect,
  useGroupCatalog,
  useLevelCatalog,
  useProgramCatalog,
  useSessionCatalog,
} from './components/pickers'
import { useDebounced } from '@/shared/lib/useDebounced'
import { ENROLLMENT_STATUSES, type SessionEnrollment } from './academics.types'

/**
 * Who is on the roll, for which session, in which programme, level and group.
 *
 * ── This is the record the whole product hangs off ─────────────────────────
 *
 * A learner's placement is not a field on the learner — it is an enrolment per
 * session. Registers, gradebooks, fee runs and progression all read it, which
 * is why a change here fans out across the cache.
 *
 * ── Ending, not deleting ───────────────────────────────────────────────────
 *
 * `POST /enrollments/{id}/end` is the only way out, and there is no DELETE.
 * A learner who left in March was on the roll until March and the register has
 * to keep saying so. Ending sets the leaving date; it does not erase the term
 * they attended.
 */

const schema = z.object({
  student_id: z.string().min(1, 'Choose a learner'),
  academic_session_id: z.string().min(1, 'Choose a session'),
  program_id: z.string().optional(),
  academic_level_id: z.string().optional(),
  learning_group_id: z.string().optional(),
  status: z.string().optional(),
  started_at: z.string().optional(),
})

type EnrollmentValues = z.infer<typeof schema>

export function EnrollmentPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access } = useTenant()
  const queryClient = useQueryClient()

  const currentSessionId = access?.calendar?.session?.id ?? ''
  const [sessionId, setSessionId] = useState(currentSessionId)
  const [status, setStatus] = useState('')
  const [groupId, setGroupId] = useState('')
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<SessionEnrollment | null>(null)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('enrollment.manage')
  const sessions = useSessionCatalog()
  const programs = useProgramCatalog()
  const levels = useLevelCatalog()
  const groups = useGroupCatalog()

  const listQuery = {
    academic_session_id: sessionId || undefined,
    status: status || undefined,
    learning_group_id: groupId || undefined,
    search: search || undefined,
    page,
  }

  const query = useQuery({
    queryKey: academicsKeys.enrollments.list(listQuery),
    queryFn: () => enrollmentsApi.list({ ...listQuery, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const blank: EnrollmentValues = {
    student_id: '',
    academic_session_id: currentSessionId,
    program_id: '',
    academic_level_id: '',
    learning_group_id: '',
    status: 'active',
    started_at: '',
  }

  const form = useForm<EnrollmentValues>({ resolver: zodResolver(schema), defaultValues: blank })
  const applyServerErrors = useServerErrors(form)

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.enrollments.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    /* An enrolment changes a group's occupancy and a student's record. */
    queryClient.invalidateQueries({ queryKey: ['students'] })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: EnrollmentValues) => {
      const payload: EnrollmentPayload = {
        student_id: values.student_id,
        academic_session_id: values.academic_session_id,
        program_id: values.program_id || null,
        academic_level_id: values.academic_level_id || null,
        learning_group_id: values.learning_group_id || null,
        status: values.status || null,
        started_at: values.started_at || null,
      }
      return editing ? enrollmentsApi.update(editing.id, payload) : enrollmentsApi.create(payload)
    },
    onSuccess: () => {
      settle(editing ? 'Enrolment updated' : 'Enrolment created')
      close()
    },
    onError: applyServerErrors,
  })

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  function open(enrollment: SessionEnrollment | null) {
    setEditing(enrollment)
    setCreating(enrollment === null)
    form.reset(
      enrollment
        ? {
            student_id: enrollment.student_id,
            academic_session_id: enrollment.academic_session_id,
            program_id: enrollment.program_id ?? '',
            academic_level_id: enrollment.academic_level_id ?? '',
            learning_group_id: enrollment.learning_group_id ?? '',
            status: enrollment.status,
            started_at: enrollment.started_at?.slice(0, 10) ?? '',
          }
        : blank,
    )
  }

  function close() {
    setEditing(null)
    setCreating(false)
    form.reset(blank)
  }

  const columns = useMemo<Column<SessionEnrollment>[]>(
    () => [
      {
        key: 'student',
        header: t('learner'),
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={row.student.name} size="md" />
            <span className="truncate">{row.student.name}</span>
          </span>
        ),
      },
      {
        key: 'number',
        header: `${t('learner')} no.`,
        width: '10rem',
        cell: (row) => (
          <span className="tabular text-gray-700">{row.student.student_number ?? '—'}</span>
        ),
      },
      {
        key: 'level',
        header: t('level'),
        width: '8rem',
        cell: (row) => <span className="text-gray-700">{row.academic_level_name ?? '—'}</span>,
      },
      {
        key: 'group',
        header: t('group'),
        width: '8rem',
        cell: (row) => <span className="text-gray-700">{row.learning_group_name ?? '—'}</span>,
      },
      {
        key: 'programme',
        header: t('programme'),
        width: '11rem',
        cell: (row) => <span className="text-gray-700">{row.program_name ?? '—'}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        width: '8rem',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      actionsColumn<SessionEnrollment>(
        (row) => row.student.name,
        (row) => {
          if (!canManage) return []
          const items: MenuItemSpec[] = [
            { key: 'edit', label: 'Edit', icon: <PencilSimple size={15} />, onSelect: () => open(row) },
          ]
          if (row.status === 'active' || row.status === 'pending') {
            items.push({
              key: 'end',
              label: 'End enrolment',
              icon: <SignOut size={15} />,
              destructive: true,
              separated: true,
              onSelect: () =>
                act.mutate({
                  run: () => enrollmentsApi.end(row.id),
                  message: `${row.student.name}'s enrolment ended`,
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

  const filtered = Boolean(search || status || groupId || sessionId)

  return (
    <PageStack>
      <PageHeader
        title="Enrolment"
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => open(null)}
            >
              New enrolment
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
              className="w-48"
            />
            <FilterSelect
              value={groupId}
              onChange={(value) => {
                setGroupId(value)
                setPage(1)
              }}
              options={groups.options}
              allLabel={`All ${t('groups').toLowerCase()}`}
              className="w-44"
            />
            <FilterSelect
              value={status}
              onChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
              options={ENROLLMENT_STATUSES.map((value) => ({ value, label: humanize(value) }))}
              allLabel="Any status"
              className="w-40"
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
            placeholder={`Search ${t('learners').toLowerCase()}`}
          />
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            rows={query.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={8}
            empty={
              filtered ? (
                <EmptyState
                  title="No matches"
                  description="Nothing matches these filters."
                  action={
                    <Button
                      onClick={() => {
                        setDraft('')
                        setStatus('')
                        setGroupId('')
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
                  title="Nobody is enrolled yet"
                  description={`Admitting a ${t('learner').toLowerCase()} creates their first enrolment. Re-enrolling for a new ${t('session').toLowerCase()} happens here.`}
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
        title={editing ? `Edit ${editing.student.name}'s enrolment` : 'New enrolment'}
        description={
          editing
            ? undefined
            : `Place a ${t('learner').toLowerCase()} on the roll for a ${t('session').toLowerCase()}.`
        }
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel={editing ? 'Save changes' : 'Enrol'}
      >
        {editing ? (
          <Field label={t('learner')}>
            {() => (
              <div className="flex h-8 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 text-sm text-gray-700">
                <Avatar name={editing.student.name} size="sm" />
                {editing.student.name}
              </div>
            )}
          </Field>
        ) : (
          <StudentPicker
            value={form.watch('student_id')}
            onChange={(id) => form.setValue('student_id', id, { shouldValidate: true })}
            error={form.formState.errors.student_id?.message}
            label={t('learner')}
          />
        )}

        <FieldRow>
          <Field
            label={t('session')}
            required
            error={form.formState.errors.academic_session_id?.message}
          >
            {(props) => (
              <Select
                {...props}
                options={sessions.options}
                placeholder={`Choose a ${t('session').toLowerCase()}`}
                {...form.register('academic_session_id')}
              />
            )}
          </Field>
          <Field label="Status" error={form.formState.errors.status?.message}>
            {(props) => (
              <Select
                {...props}
                options={ENROLLMENT_STATUSES.map((value) => ({ value, label: humanize(value) }))}
                {...form.register('status')}
              />
            )}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label={t('programme')} error={form.formState.errors.program_id?.message}>
            {(props) => (
              <Select
                {...props}
                options={[{ value: '', label: 'None' }, ...programs.options]}
                {...form.register('program_id')}
              />
            )}
          </Field>
          <Field label={t('level')} error={form.formState.errors.academic_level_id?.message}>
            {(props) => (
              <Select
                {...props}
                options={[{ value: '', label: 'None' }, ...levels.options]}
                {...form.register('academic_level_id')}
              />
            )}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label={t('group')} error={form.formState.errors.learning_group_id?.message}>
            {(props) => (
              <Select
                {...props}
                options={[{ value: '', label: 'None' }, ...groups.options]}
                {...form.register('learning_group_id')}
              />
            )}
          </Field>
          <Field label="Started on" error={form.formState.errors.started_at?.message}>
            {(props) => <Input {...props} type="date" {...form.register('started_at')} />}
          </Field>
        </FieldRow>
      </FormDialog>
    </PageStack>
  )
}

/**
 * Picking one learner out of a hundred.
 *
 * There is no `catalog/students` endpoint — and there should not be, since a
 * catalogue is a capped list and a roll is not — so this searches the real
 * roster. It waits for two characters before asking: a one-letter search
 * returns most of the school and is slower to read than typing another letter.
 */
function StudentPicker({
  value,
  onChange,
  error,
  label,
}: {
  value: string
  onChange: (id: string) => void
  error?: string
  label: string
}) {
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const enabled = search.trim().length >= 2

  const query = useQuery({
    queryKey: ['students', 'picker', search],
    queryFn: () =>
      getPage<{ id: string; student_number: string | null; person: { full_name: string } }>(
        '/admin/students',
        { params: params({ search, per_page: 20 }) },
      ),
    enabled,
    staleTime: 60_000,
  })

  const options = (query.data?.rows ?? []).map((row) => ({
    value: row.id,
    label: row.student_number ? `${row.person.full_name} · ${row.student_number}` : row.person.full_name,
  }))

  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label} required error={error} hint="Search by name or number">
        {(props) => (
          <Input
            {...props}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Start typing a name…"
          />
        )}
      </Field>

      {enabled && (
        <Select
          aria-label={`Matching ${label.toLowerCase()}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={query.isLoading || options.length === 0}
          options={
            options.length > 0
              ? [{ value: '', label: `${options.length} match${options.length === 1 ? '' : 'es'} — choose one` }, ...options]
              : [{ value: '', label: query.isLoading ? 'Searching…' : 'No matches' }]
          }
        />
      )}
    </div>
  )
}
