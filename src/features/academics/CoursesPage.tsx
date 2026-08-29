import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Archive, ArrowSquareOut, PencilSimple, Plus } from '@phosphor-icons/react'
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
import { coursesApi, type CoursePayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { actionsColumn } from './components/RowActions'
import { reportError, useServerErrors } from './components/useServerErrors'
import { useUnitCatalog } from './components/pickers'
import { useDebounced } from '@/shared/lib/useDebounced'
import type { Course } from './academics.types'

/**
 * The subjects an institution teaches.
 *
 * ── A course is not an offering ────────────────────────────────────────────
 *
 * "Basic Science" is a course; "Basic Science, JSS 1A, First Term, taught by
 * Mrs Larkin" is an offering. This screen owns the first — the catalogue entry
 * that exists once — and `offering_count` is the link to the second. Editing a
 * course changes what every offering of it is called; it does not touch when
 * or to whom it is taught.
 *
 * ── No delete, for the reason programmes have none ─────────────────────────
 *
 * The API offers archive only. A subject with offerings, assessments and marks
 * behind it cannot be removed without breaking every record that names it.
 */

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title'),
  code: z.string().trim().min(1, 'Enter a code'),
  course_type: z.string().trim().optional(),
  credit_units: z.string().optional(),
  contact_hours: z.string().optional(),
  organizational_unit_id: z.string().optional(),
  description: z.string().optional(),
})

type CourseValues = z.infer<typeof schema>

const BLANK: CourseValues = {
  title: '',
  code: '',
  course_type: '',
  credit_units: '',
  contact_hours: '',
  organizational_unit_id: '',
  description: '',
}

export function CoursesPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access } = useTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Course | null>(null)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('courses.manage')
  const supportsUnits = access?.institution.supports_organizational_units ?? false
  const units = useUnitCatalog(supportsUnits)
  const showCredits = access?.institution.supports_credit_system ?? false

  const listQuery = { search: search || undefined, page }

  const query = useQuery({
    queryKey: academicsKeys.courses.list(listQuery),
    queryFn: () => coursesApi.list({ ...listQuery, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const rows = query.data?.rows ?? []

  const typeSuggestions = useMemo(
    () => [...new Set(rows.map((row) => row.course_type).filter((v): v is string => Boolean(v)))],
    [rows],
  )

  const form = useForm<CourseValues>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const applyServerErrors = useServerErrors(form)

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.courses.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: CourseValues) => {
      const payload: CoursePayload = {
        title: values.title.trim(),
        code: values.code.trim(),
        course_type: values.course_type?.trim() || null,
        credit_units: values.credit_units ? Number(values.credit_units) : null,
        contact_hours: values.contact_hours ? Number(values.contact_hours) : null,
        organizational_unit_id: values.organizational_unit_id || null,
        description: values.description?.trim() || null,
      }
      return editing ? coursesApi.update(editing.id, payload) : coursesApi.create(payload)
    },
    onSuccess: () => {
      settle(editing ? `${t('course')} updated` : `${t('course')} created`)
      close()
    },
    onError: applyServerErrors,
  })

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  function open(course: Course | null) {
    setEditing(course)
    setCreating(course === null)
    form.reset(
      course
        ? {
            title: course.title,
            code: course.code,
            course_type: course.course_type ?? '',
            credit_units: String(course.credit_units ?? ''),
            contact_hours: String(course.contact_hours ?? ''),
            organizational_unit_id: course.organizational_unit?.id ?? '',
            description: course.description ?? '',
          }
        : BLANK,
    )
  }

  function close() {
    setEditing(null)
    setCreating(false)
    form.reset(BLANK)
  }

  const columns = useMemo<Column<Course>[]>(() => {
    const base: Column<Course>[] = [
      {
        key: 'title',
        header: t('course'),
        /* Plain text: `rowHref` below renders the first column inside a real
         * anchor, and a link nested in a link is neither. */
        cell: (row) => <span className="font-medium">{row.title}</span>,
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
        width: '8rem',
        cell: (row) => <span className="text-gray-700">{humanize(row.course_type)}</span>,
      },
    ]

    /* Credits mean nothing to an institution that does not run a credit
     * system, and a column of dashes is worse than no column. */
    if (showCredits) {
      base.push({
        key: 'credits',
        header: 'Credits',
        numeric: true,
        width: '6rem',
        cell: (row) => formatNumber(row.credit_units),
      })
    }

    base.push(
      {
        key: 'offerings',
        header: 'Offerings',
        numeric: true,
        width: '7rem',
        cell: (row) => formatNumber(row.offering_count),
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
      actionsColumn<Course>(
        (row) => row.title,
        (row) => {
          if (!canManage || !row.can_manage) return []
          const items: MenuItemSpec[] = [
            {
              key: 'open',
              label: 'Open',
              icon: <ArrowSquareOut size={15} />,
              onSelect: () =>
                void navigate({ to: '/courses/$courseId', params: { courseId: row.id } }),
            },
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
                  run: () => coursesApi.archive(row.id),
                  message: `${row.title} archived`,
                }),
            })
          }
          return items
        },
      ),
    )

    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, canManage, showCredits, navigate])

  return (
    <PageStack>
      <PageHeader
        title={t('courses')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => open(null)}
            >
              New {t('course').toLowerCase()}
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
            placeholder={`Search ${t('courses').toLowerCase()}`}
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
            /* The way into the subject — where the classes taking it and the
             * curriculum each of them has actually live. `rowHref` rather than
             * a click handler so the row can be middle-clicked, opened in a new
             * tab and reached from the keyboard. */
            rowHref={(row) => `/courses/${row.id}`}
            loading={query.isLoading}
            skeletonRows={5}
            empty={
              search ? (
                <EmptyState
                  title="No matches"
                  description={`Nothing matches “${search}”.`}
                  action={<Button onClick={() => setDraft('')}>Clear search</Button>}
                />
              ) : (
                <EmptyState
                  title={`No ${t('courses').toLowerCase()} yet`}
                  description={`Add the subjects taught here. Timetables, gradebooks and offerings are all built on them.`}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => open(null)}>
                        New {t('course').toLowerCase()}
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
        title={editing ? `Edit ${editing.title}` : `New ${t('course').toLowerCase()}`}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel={editing ? 'Save changes' : 'Create'}
      >
        <FieldRow>
          <Field label="Title" required error={form.formState.errors.title?.message}>
            {(props) => <Input {...props} placeholder="Basic Science" {...form.register('title')} />}
          </Field>
          <Field label="Code" required error={form.formState.errors.code?.message}>
            {(props) => <Input {...props} placeholder="BSC" {...form.register('code')} />}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Kind" error={form.formState.errors.course_type?.message}>
            {(props) => (
              <>
                <Input
                  {...props}
                  list="course-types"
                  placeholder="core"
                  {...form.register('course_type')}
                />
                <datalist id="course-types">
                  {typeSuggestions.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Contact hours" error={form.formState.errors.contact_hours?.message}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                placeholder="45"
                {...form.register('contact_hours')}
              />
            )}
          </Field>
        </FieldRow>

        {showCredits && (
          <Field label="Credit units" error={form.formState.errors.credit_units?.message}>
            {(props) => (
              <Input {...props} type="number" min={0} {...form.register('credit_units')} />
            )}
          </Field>
        )}

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
