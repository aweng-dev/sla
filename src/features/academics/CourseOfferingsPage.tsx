import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { PencilSimple, Plus } from '@phosphor-icons/react'
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
  Toolbar,
  type Column,
  type MenuItemSpec,
} from '@/shared/ui'
import { offeringsApi, type OfferingPayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { actionsColumn } from './components/RowActions'
import { useServerErrors } from './components/useServerErrors'
import {
  FilterSelect,
  useCourseCatalog,
  useGroupCatalog,
  usePeriodCatalog,
  useSessionCatalog,
} from './components/pickers'
import { useDebounced } from '@/shared/lib/useDebounced'
import {
  DELIVERY_MODES,
  OFFERING_STATUSES,
  type CourseOffering,
} from './academics.types'

/**
 * A subject, taught to a particular group, in a particular period, by
 * particular staff. The thing a timetable slot and a gradebook actually point
 * at.
 *
 * ── Why this is separate from the course ───────────────────────────────────
 *
 * "Basic Science" exists once. "Basic Science for JSS 1A in First Term" exists
 * fifteen times over a school's year, each with its own roll, its own teacher
 * and its own marks. Editing the catalogue entry renames all of them; editing
 * one of these changes only that class's arrangement.
 *
 * ── The row carries its instructors ────────────────────────────────────────
 *
 * `instructors[]` is embedded in the list response, so the teacher's name is
 * on the row without a second request. Adding or removing one is a separate
 * endpoint and lives on the detail screen, where there is room to say which
 * role each holds.
 */

const schema = z.object({
  course_id: z.string().min(1, 'Choose a subject'),
  academic_period_id: z.string().min(1, 'Choose a period'),
  code: z.string().trim().min(1, 'Enter a code'),
  academic_session_id: z.string().optional(),
  learning_group_id: z.string().optional(),
  capacity: z.string().optional(),
  delivery_mode: z.string().optional(),
  status: z.string().optional(),
})

type OfferingValues = z.infer<typeof schema>

export function CourseOfferingsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access } = useTenant()
  const queryClient = useQueryClient()

  const currentSessionId = access?.calendar?.session?.id ?? ''
  const currentPeriodId = access?.calendar?.period?.id ?? ''

  const [sessionId, setSessionId] = useState(currentSessionId)
  const [groupId, setGroupId] = useState('')
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<CourseOffering | null>(null)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('course_offerings.manage')
  const sessions = useSessionCatalog()
  const periods = usePeriodCatalog()
  const courses = useCourseCatalog()
  const groups = useGroupCatalog()

  const listQuery = {
    academic_session_id: sessionId || undefined,
    learning_group_id: groupId || undefined,
    search: search || undefined,
    page,
  }

  const query = useQuery({
    queryKey: academicsKeys.offerings.list(listQuery),
    queryFn: () => offeringsApi.list({ ...listQuery, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const blank: OfferingValues = {
    course_id: '',
    academic_period_id: currentPeriodId,
    code: '',
    academic_session_id: currentSessionId,
    learning_group_id: '',
    capacity: '',
    delivery_mode: 'physical',
    status: 'active',
  }

  const form = useForm<OfferingValues>({ resolver: zodResolver(schema), defaultValues: blank })
  const applyServerErrors = useServerErrors(form)

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.offerings.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: OfferingValues) => {
      const payload: OfferingPayload = {
        course_id: values.course_id,
        academic_period_id: values.academic_period_id,
        code: values.code.trim(),
        academic_session_id: values.academic_session_id || null,
        learning_group_id: values.learning_group_id || null,
        capacity: values.capacity ? Number(values.capacity) : null,
        delivery_mode: values.delivery_mode || null,
        status: values.status || null,
      }
      return editing ? offeringsApi.update(editing.id, payload) : offeringsApi.create(payload)
    },
    onSuccess: () => {
      settle(editing ? 'Offering updated' : 'Offering created')
      close()
    },
    onError: applyServerErrors,
  })

  function open(offering: CourseOffering | null) {
    setEditing(offering)
    setCreating(offering === null)
    form.reset(
      offering
        ? {
            course_id: offering.course_id,
            academic_period_id: offering.academic_period_id,
            code: offering.code,
            academic_session_id: offering.academic_session_id ?? '',
            learning_group_id: offering.learning_group_id ?? '',
            capacity: String(offering.capacity ?? ''),
            delivery_mode: offering.delivery_mode,
            status: offering.status,
          }
        : blank,
    )
  }

  function close() {
    setEditing(null)
    setCreating(false)
    form.reset(blank)
  }

  const columns = useMemo<Column<CourseOffering>[]>(
    () => [
      {
        key: 'course',
        header: t('course'),
        cell: (row) => <span className="font-medium">{row.course_title}</span>,
      },
      {
        key: 'code',
        header: 'Code',
        width: '11rem',
        cell: (row) => <span className="tabular text-gray-700">{row.code}</span>,
      },
      {
        key: 'group',
        header: t('group'),
        width: '9rem',
        cell: (row) => <span className="text-gray-700">{row.learning_group_name ?? '—'}</span>,
      },
      {
        key: 'period',
        header: t('period'),
        width: '9rem',
        cell: (row) => <span className="text-gray-700">{row.academic_period_name ?? '—'}</span>,
      },
      {
        key: 'staff',
        header: t('courseTeacher'),
        width: '13rem',
        /* The primary first — an offering can have an assistant and an
         * examiner too, and the person who teaches it is the one that belongs
         * on a list row. */
        cell: (row) => {
          const primary = row.instructors.find((i) => i.is_primary) ?? row.instructors[0]
          if (!primary) return <span className="text-gray-500">Unassigned</span>
          const extra = row.instructors.length - 1
          return (
            <span className="text-gray-700">
              {primary.name}
              {extra > 0 && <span className="text-gray-500"> +{extra}</span>}
            </span>
          )
        },
      },
      {
        key: 'registered',
        header: 'Registered',
        numeric: true,
        width: '9rem',
        cell: (row) => (
          <span className={row.capacity !== null && !row.has_space ? 'text-danger-500' : undefined}>
            {formatNumber(row.registered_count)}
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
      actionsColumn<CourseOffering>(
        (row) => `${row.course_title} ${row.code}`,
        (row) => {
          if (!canManage) return []
          const items: MenuItemSpec[] = [
            { key: 'edit', label: 'Edit', icon: <PencilSimple size={15} />, onSelect: () => open(row) },
          ]
          return items
        },
      ),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage],
  )

  const filtered = Boolean(search || groupId || sessionId)

  return (
    <PageStack>
      <PageHeader
        title="Course offerings"
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => open(null)}
            >
              New offering
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
              value={groupId}
              onChange={(value) => {
                setGroupId(value)
                setPage(1)
              }}
              options={groups.options}
              allLabel={`All ${t('groups').toLowerCase()}`}
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
            placeholder="Search offerings"
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
            skeletonRows={6}
            empty={
              filtered ? (
                <EmptyState
                  title="No matches"
                  description="Nothing matches these filters."
                  action={
                    <Button
                      onClick={() => {
                        setDraft('')
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
                  title="No offerings yet"
                  description={`An offering is what a timetable slot and a gradebook point at. Create one per ${t('course').toLowerCase()} each ${t('group').toLowerCase()} takes.`}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => open(null)}>
                        New offering
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
        title={editing ? `Edit ${editing.code}` : 'New offering'}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel={editing ? 'Save changes' : 'Create'}
      >
        <FieldRow>
          <Field label={t('course')} required error={form.formState.errors.course_id?.message}>
            {(props) => (
              <Select
                {...props}
                options={courses.options}
                placeholder={`Choose a ${t('course').toLowerCase()}`}
                {...form.register('course_id')}
              />
            )}
          </Field>
          <Field label="Code" required error={form.formState.errors.code?.message}>
            {(props) => <Input {...props} placeholder="BSC-JSS1-T1" {...form.register('code')} />}
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
          <Field
            label={t('period')}
            required
            error={form.formState.errors.academic_period_id?.message}
          >
            {(props) => (
              <Select
                {...props}
                options={periods.options}
                placeholder={`Choose a ${t('period').toLowerCase()}`}
                {...form.register('academic_period_id')}
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
          <Field label="Delivery" error={form.formState.errors.delivery_mode?.message}>
            {(props) => (
              <Select
                {...props}
                options={DELIVERY_MODES.map((value) => ({ value, label: humanize(value) }))}
                {...form.register('delivery_mode')}
              />
            )}
          </Field>
          <Field label="Status" error={form.formState.errors.status?.message}>
            {(props) => (
              <Select
                {...props}
                options={OFFERING_STATUSES.map((value) => ({ value, label: humanize(value) }))}
                {...form.register('status')}
              />
            )}
          </Field>
        </FieldRow>
      </FormDialog>
    </PageStack>
  )
}
