import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Notebook, Plus } from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { formatDate, formatDateTime, formatNumber, humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Badge,
  Button,
  Card,
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
} from '@/shared/ui'
import { FieldRow, FormDialog } from '@/features/academics/components/FormDialog'
import { useServerErrors } from '@/features/academics/components/useServerErrors'
import { FilterSelect, useOfferingCatalog } from '@/features/academics/components/pickers'
import { useDebounced } from '@/shared/lib/useDebounced'
import { portalLearningApi, teachingApi, type AssignmentPayload } from './learning.api'
import { learningKeys } from './learning.keys'
import { ASSIGNMENT_STATUSES, SUBMISSION_KINDS, type Assignment } from './learning.types'

/**
 * What has been set, and — for a learner — what is owed.
 *
 * ── Two screens behind one route ───────────────────────────────────────────
 *
 * `/teaching/assignments` answers 200 to staff and 403 ACCESS_DENIED to a
 * learner; `/portal/assignments` answers everybody, narrowed to them. The
 * discriminator is a staff PROFILE, not a permission — a learner holds
 * `assignments.view` and is still refused — so this branches on
 * `useTenant().portal`, the same way the students screens do.
 */
export function AssignmentsPage() {
  const { portal } = useTenant()
  if (portal === 'student' || portal === 'guardian') return <LearnerAssignments />
  return <StaffAssignments />
}

/* ── Staff ──────────────────────────────────────────────────────────────── */

const schema = z.object({
  course_offering_id: z.string().min(1, 'Choose what this is set for'),
  title: z.string().trim().min(1, 'Enter a title'),
  instructions: z.string().optional(),
  submission_kind: z.string().optional(),
  max_score: z.string().optional(),
  max_attempts: z.string().optional(),
  due_at: z.string().min(1, 'Choose a due date'),
  allows_late_submission: z.boolean().optional(),
  late_penalty_percent: z.string().optional(),
})

type AssignmentValues = z.infer<typeof schema>

const BLANK: AssignmentValues = {
  course_offering_id: '',
  title: '',
  instructions: '',
  submission_kind: 'text',
  max_score: '20',
  max_attempts: '1',
  due_at: '',
  allows_late_submission: false,
  late_penalty_percent: '',
}

function StaffAssignments() {
  const t = useTerminology()
  const perms = usePermissions()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [offeringId, setOfferingId] = useState('')
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('assignments.manage')
  const offerings = useOfferingCatalog()

  const listQuery = {
    course_offering_id: offeringId || undefined,
    status: status || undefined,
    search: search || undefined,
    page,
  }

  const query = useQuery({
    queryKey: learningKeys.assignments.list(listQuery),
    queryFn: () => teachingApi.assignments({ ...listQuery, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const form = useForm<AssignmentValues>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const applyServerErrors = useServerErrors(form)

  const save = useMutation({
    mutationFn: (values: AssignmentValues) => {
      const payload: AssignmentPayload = {
        title: values.title.trim(),
        /* `due_at` is a datetime on the wire; the control is a date, so it is
         * anchored to end of day rather than midnight — an assignment due "on
         * the 12th" is not due at one second past midnight on the 12th. */
        due_at: `${values.due_at}T23:59:00`,
        instructions: values.instructions?.trim() || null,
        submission_kind: values.submission_kind || null,
        max_score: values.max_score ? Number(values.max_score) : null,
        max_attempts: values.max_attempts ? Number(values.max_attempts) : null,
        allows_late_submission: values.allows_late_submission ?? false,
        late_penalty_percent: values.late_penalty_percent
          ? Number(values.late_penalty_percent)
          : null,
      }
      return teachingApi.createAssignment(values.course_offering_id, payload)
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: learningKeys.assignments.all })
      toast.success('Assignment created as a draft')
      setCreating(false)
      form.reset(BLANK)
      /* Straight into it — a new assignment is a draft nobody can see, and the
       * next thing anyone does is write it and publish. */
      navigate({ to: '/assignments/$assignmentId', params: { assignmentId: created.id } })
    },
    onError: applyServerErrors,
  })

  const columns = useMemo<Column<Assignment>[]>(
    () => [
      {
        key: 'title',
        header: 'Assignment',
        cell: (row) => <span className="font-medium">{row.title}</span>,
      },
      {
        key: 'course',
        header: t('course'),
        width: '11rem',
        cell: (row) => <span className="text-gray-700">{row.course_title ?? '—'}</span>,
      },
      {
        key: 'due',
        header: 'Due',
        width: '11rem',
        cell: (row) => (
          <span className={row.is_overdue ? 'text-danger-500' : 'text-gray-700'}>
            {formatDate(row.due_at)}
          </span>
        ),
      },
      {
        key: 'kind',
        header: 'Hand-in',
        width: '8rem',
        cell: (row) => <span className="text-gray-700">{humanize(row.submission_kind)}</span>,
      },
      {
        key: 'score',
        header: 'Out of',
        numeric: true,
        width: '6rem',
        cell: (row) => formatNumber(row.max_score),
      },
      {
        key: 'status',
        header: 'Status',
        width: '8rem',
        cell: (row) => <StatusBadge status={row.status} />,
      },
    ],
    [t],
  )

  const filtered = Boolean(search || status || offeringId)

  return (
    <PageStack>
      <PageHeader
        title="Assignments"
        actions={
          canManage ? (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => {
                form.reset(BLANK)
                setCreating(true)
              }}
            >
              New assignment
            </Button>
          ) : undefined
        }
      />

      <Toolbar
        filters={
          <>
            <FilterSelect
              value={offeringId}
              onChange={(value) => {
                setOfferingId(value)
                setPage(1)
              }}
              options={offerings.options}
              allLabel="All offerings"
              className="w-56"
            />
            <FilterSelect
              value={status}
              onChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
              options={ASSIGNMENT_STATUSES.map((value) => ({ value, label: humanize(value) }))}
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
            placeholder="Search assignments"
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
            rowHref={(row) => `/assignments/${row.id}`}
            loading={query.isLoading}
            skeletonRows={5}
            empty={
              filtered ? (
                <EmptyState
                  icon={<Notebook size={20} />}
                  title="No matches"
                  description="Nothing matches these filters."
                  action={
                    <Button
                      onClick={() => {
                        setDraft('')
                        setStatus('')
                        setOfferingId('')
                        setPage(1)
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Notebook size={20} />}
                  title="Nothing set yet"
                  description={`An assignment is set against one offering — a ${t('course').toLowerCase()} taught to one ${t('group').toLowerCase()} in one ${t('period').toLowerCase()}. It stays a draft until you publish it.`}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => setCreating(true)}>
                        New assignment
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
        open={creating}
        onClose={() => setCreating(false)}
        title="New assignment"
        description="It is created as a draft — nobody sees it until you publish."
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel="Create draft"
        size="lg"
      >
        <Field
          label="Set for"
          required
          hint={`The ${t('course').toLowerCase()}, ${t('group').toLowerCase()} and ${t('period').toLowerCase()} this belongs to`}
          error={form.formState.errors.course_offering_id?.message}
        >
          {(props) => (
            <Select
              {...props}
              options={offerings.options}
              placeholder="Choose an offering"
              {...form.register('course_offering_id')}
            />
          )}
        </Field>

        <Field label="Title" required error={form.formState.errors.title?.message}>
          {(props) => (
            <Input {...props} placeholder="Chapter 4 — Fractions worksheet" {...form.register('title')} />
          )}
        </Field>

        <Field label="Instructions" error={form.formState.errors.instructions?.message}>
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              placeholder="What to do, and what good work looks like."
              {...form.register('instructions')}
            />
          )}
        </Field>

        <FieldRow>
          <Field label="Due" required error={form.formState.errors.due_at?.message}>
            {(props) => <Input {...props} type="date" {...form.register('due_at')} />}
          </Field>
          <Field label="Hand-in" error={form.formState.errors.submission_kind?.message}>
            {(props) => (
              <Select
                {...props}
                options={SUBMISSION_KINDS.map((value) => ({ value, label: humanize(value) }))}
                {...form.register('submission_kind')}
              />
            )}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Out of" error={form.formState.errors.max_score?.message}>
            {(props) => (
              <Input {...props} type="number" min={1} {...form.register('max_score')} />
            )}
          </Field>
          <Field
            label="Attempts allowed"
            error={form.formState.errors.max_attempts?.message}
          >
            {(props) => (
              <Input {...props} type="number" min={1} max={20} {...form.register('max_attempts')} />
            )}
          </Field>
        </FieldRow>

        <div className="flex items-start gap-2 pt-1">
          <input
            id="allows-late"
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer rounded-sm border border-gray-400 accent-brand-400"
            {...form.register('allows_late_submission')}
          />
          <label htmlFor="allows-late" className="text-sm text-gray-800">
            Accept late work
            <span className="block text-xs text-gray-600">
              Late submissions are flagged and can carry a penalty.
            </span>
          </label>
        </div>

        {form.watch('allows_late_submission') && (
          <Field
            label="Late penalty"
            hint="Percent taken off a late submission"
            error={form.formState.errors.late_penalty_percent?.message}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                max={100}
                placeholder="10"
                {...form.register('late_penalty_percent')}
              />
            )}
          </Field>
        )}
      </FormDialog>
    </PageStack>
  )
}

/* ── Learner and guardian ───────────────────────────────────────────────── */

/**
 * What this learner has been set.
 *
 * A list rather than a table: the questions are "what is owed", "by when" and
 * "have I handed it in", and each is a sentence rather than a column.
 */
function LearnerAssignments() {
  const t = useTerminology()
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: learningKeys.portal.assignments({ page }),
    queryFn: () => portalLearningApi.assignments({ page, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const rows = query.data?.rows ?? []

  return (
    <PageStack>
      <PageHeader title="Assignments" />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 && !query.isLoading ? (
        <Card>
          <EmptyState
            icon={<Notebook size={20} />}
            title="Nothing set"
            description={`When a ${t('teacher').toLowerCase()} publishes an assignment for one of your ${t('courses').toLowerCase()}, it appears here.`}
          />
        </Card>
      ) : (
        <>
          <Card>
            <ul className="divide-y divide-gray-200">
              {rows.map((row) => (
                <li key={row.id}>
                  <a
                    href={`/assignments/${row.id}`}
                    className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{row.title}</p>
                      <p className="mt-0.5 text-xs text-gray-600">
                        {row.course_title ?? t('course')} · out of {formatNumber(row.max_score)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {row.is_overdue && <Badge tone="danger">Overdue</Badge>}
                      {!row.accepts_submissions_now && !row.is_overdue && (
                        <Badge tone="neutral">Closed</Badge>
                      )}
                      <span className="text-xs text-gray-600">
                        Due {formatDateTime(row.due_at)}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}
    </PageStack>
  )
}
