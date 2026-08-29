import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CaretDown,
  ChatText,
  ClipboardText,
  Lock,
  Notebook,
  PaperPlaneTilt,
  Sidebar as SidebarIcon,
  X,
} from '@phosphor-icons/react'
import { formatDateTime, formatNumber, humanize } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  EntityIcon,
  ErrorState,
  Fact,
  Facts,
  Field,
  Menu,
  MetaDot,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea,
  panelId,
  type MenuItemSpec,
} from '@/shared/ui'
import { FormDialog } from '@/features/academics/components/FormDialog'
import { reportError, useServerErrors } from '@/features/academics/components/useServerErrors'
import { portalLearningApi, teachingApi } from './learning.api'
import { learningKeys } from './learning.keys'
import type { Assignment, AssignmentSubmission } from './learning.types'

/**
 * One assignment: what was set, and what came back.
 *
 * ── The layout is Sprig's study detail, deliberately ───────────────────────
 *
 * Sprig's study screen is the same problem — one artefact, its configuration,
 * and the responses it collected — so this borrows its anatomy rather than
 * inventing one: a tinted icon tile beside the title, a meta line of small
 * facts under it, a status control and the edit action top-right, underline
 * tabs for Summary and Submissions, and a closable Details panel on the right
 * carrying the grouped configuration facts. The main column holds an overview
 * card, a figure block and the results.
 *
 * ── The status control is a menu of TRANSITIONS ────────────────────────────
 *
 * Sprig's reads "In-Progress ⌄" and opens Pause / Complete / Archive. The same
 * shape works here because publish and close are POSTs to named sub-routes,
 * not values of a field — and only the transitions that apply from the current
 * status are offered.
 */
export function AssignmentDetailPage() {
  const { assignmentId } = useParams({ strict: false }) as { assignmentId: string }
  const { portal } = useTenant()

  if (portal === 'student' || portal === 'guardian') {
    return <LearnerAssignmentDetail assignmentId={assignmentId} />
  }
  return <StaffAssignmentDetail assignmentId={assignmentId} />
}

/* ── Staff ──────────────────────────────────────────────────────────────── */

function StaffAssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const t = useTerminology()
  const perms = usePermissions()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<'summary' | 'submissions'>('summary')
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [marking, setMarking] = useState<AssignmentSubmission | null>(null)

  const canManage = perms.has('assignments.manage')
  const tabsId = 'assignment-tabs'

  const assignment = useQuery({
    queryKey: learningKeys.assignments.detail(assignmentId),
    queryFn: () => teachingApi.assignment(assignmentId),
  })

  const submissions = useQuery({
    queryKey: learningKeys.assignments.submissions(assignmentId),
    queryFn: () => teachingApi.submissions(assignmentId, { per_page: 100 }),
    enabled: assignment.isSuccess,
  })

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: learningKeys.assignments.all })
    toast.success(message)
  }

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  if (assignment.isError) {
    return (
      <PageStack>
        <ErrorState error={assignment.error} onRetry={() => assignment.refetch()} />
      </PageStack>
    )
  }

  if (assignment.isLoading || !assignment.data) {
    return (
      <PageStack>
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  const a = assignment.data
  const rows = submissions.data?.rows ?? []
  const marked = rows.filter((r) => r.score !== null)
  const average =
    marked.length > 0 ? marked.reduce((sum, r) => sum + (r.score ?? 0), 0) / marked.length : null

  const transitions: MenuItemSpec[] = []
  if (canManage && a.status === 'draft') {
    transitions.push({
      key: 'publish',
      label: 'Publish to learners',
      icon: <PaperPlaneTilt size={15} />,
      onSelect: () =>
        act.mutate({
          run: () => teachingApi.publishAssignment(a.id),
          message: `${a.title} published`,
        }),
    })
  }
  if (canManage && a.status === 'published') {
    transitions.push({
      key: 'close',
      label: 'Close for submissions',
      icon: <Lock size={15} />,
      onSelect: () =>
        act.mutate({
          run: () => teachingApi.closeAssignment(a.id),
          message: `${a.title} closed`,
        }),
    })
  }

  return (
    <PageStack>
      <Link
        to="/assignments"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft size={16} weight="bold" />
        All assignments
      </Link>

      <PageHeader
        title={a.title}
        icon={
          <EntityIcon tone="brand">
            <Notebook size={18} />
          </EntityIcon>
        }
        meta={
          <>
            <span>{a.course_title ?? t('course')}</span>
            <MetaDot />
            <span>Out of {formatNumber(a.max_score)}</span>
            <MetaDot />
            <span className={a.is_overdue ? 'text-danger-500' : undefined}>
              Due {formatDateTime(a.due_at)}
            </span>
            {a.set_by && (
              <>
                <MetaDot />
                <span>Set by {a.set_by}</span>
              </>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {transitions.length > 0 ? (
              <Menu
                items={transitions}
                trigger={({ toggle, ref, open }) => (
                  <button
                    ref={ref as never}
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    aria-haspopup="menu"
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-sm text-gray-900 transition-colors hover:bg-gray-50',
                      open ? 'border-gray-400' : 'border-gray-300',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        a.status === 'published'
                          ? 'bg-success-500'
                          : a.status === 'closed'
                            ? 'bg-gray-400'
                            : 'bg-brand-400',
                      )}
                      aria-hidden
                    />
                    {a.status_label}
                    <CaretDown size={11} weight="bold" className="text-gray-600" />
                  </button>
                )}
              />
            ) : (
              <StatusBadge status={a.status} />
            )}
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-label={detailsOpen ? 'Hide details' : 'Show details'}
              aria-pressed={detailsOpen}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <SidebarIcon size={16} />
            </button>
          </div>
        }
        tabs={
          <Tabs bare
          baseId={tabsId}
          value={tab}
          onChange={(key) => setTab(key as 'summary' | 'submissions')}
          items={[
            { key: 'summary', label: 'Summary', icon: <ClipboardText size={14} /> },
            {
              key: 'submissions',
              label: 'Submissions',
              icon: <ChatText size={14} />,
              count: submissions.data?.pagination.total,
            },
          ]}
        />
        }
      />


      <div
        role="tabpanel"
        id={panelId(tabsId, tab)}
        aria-labelledby={`${tabsId}-tab-${tab}`}
        className={cn('grid gap-5', detailsOpen ? 'lg:grid-cols-[1fr_20rem]' : 'grid-cols-1')}
      >
        <div className="flex min-w-0 flex-col gap-5">
          {tab === 'summary' && (
            <>
              <Card>
                <CardHeader title="What was set" />
                <div className="px-4 py-3">
                  {a.instructions ? (
                    <p className="whitespace-pre-wrap text-sm text-gray-800">{a.instructions}</p>
                  ) : (
                    <p className="text-sm text-gray-600">
                      No instructions were written. Learners see only the title and the due date.
                    </p>
                  )}
                </div>
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                <Figure label="Submitted" value={formatNumber(rows.length)} hint="of the class" />
                <Figure
                  label="Marked"
                  value={formatNumber(marked.length)}
                  hint={rows.length > 0 ? `${rows.length - marked.length} to go` : undefined}
                />
                <Figure
                  label="Average"
                  value={average === null ? '—' : average.toFixed(1)}
                  hint={average === null ? 'nothing marked yet' : `out of ${a.max_score}`}
                />
              </div>

              {marked.length > 0 && (
                <Card>
                  <CardHeader title="Marks" subtitle={`${marked.length} marked`} />
                  <div className="flex flex-col gap-2.5 px-4 py-4">
                    {marked
                      .slice()
                      .sort((x, y) => (y.score ?? 0) - (x.score ?? 0))
                      .map((row) => (
                        <ScoreBar
                          key={row.id}
                          label={row.student_name ?? 'Learner'}
                          score={row.score ?? 0}
                          max={a.max_score}
                        />
                      ))}
                  </div>
                </Card>
              )}
            </>
          )}

          {tab === 'submissions' &&
            (submissions.isError ? (
              <ErrorState error={submissions.error} onRetry={() => submissions.refetch()} />
            ) : rows.length === 0 && !submissions.isLoading ? (
              <Card>
                <EmptyState
                  icon={<ChatText size={20} />}
                  title="Nothing handed in yet"
                  description={
                    a.status === 'draft'
                      ? 'This is still a draft — publish it before anyone can submit.'
                      : `Work appears here as ${t('learners').toLowerCase()} submit it.`
                  }
                />
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {submissions.isLoading && <Skeleton className="h-32 w-full" />}
                {rows.map((row) => (
                  <SubmissionCard
                    key={row.id}
                    submission={row}
                    max={a.max_score}
                    canMark={canManage}
                    onMark={() => setMarking(row)}
                    onRelease={() =>
                      act.mutate({
                        run: () => teachingApi.release(a.id, row.id),
                        message: `Mark released to ${row.student_name ?? 'the learner'}`,
                      })
                    }
                  />
                ))}
              </div>
            ))}
        </div>

        {detailsOpen && (
          <aside className="flex flex-col gap-4">
            <Card>
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Details</h3>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  aria-label="Hide details"
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <X size={13} />
                </button>
              </div>
              <Facts>
                <Fact label="Status">{a.status_label}</Fact>
                <Fact label={t('course')}>{a.course_title ?? '—'}</Fact>
                <Fact label="Hand-in">{humanize(a.submission_kind)}</Fact>
                <Fact label="Out of">{formatNumber(a.max_score)}</Fact>
                <Fact label="Attempts">{formatNumber(a.max_attempts)}</Fact>
                <Fact label="Opens">{a.opens_at ? formatDateTime(a.opens_at) : 'On publish'}</Fact>
                <Fact label="Due">{formatDateTime(a.due_at)}</Fact>
                <Fact label="Closes">{a.closes_at ? formatDateTime(a.closes_at) : 'Not set'}</Fact>
                <Fact label="Late work">
                  {a.allows_late_submission
                    ? a.late_penalty_percent
                      ? `Accepted, −${a.late_penalty_percent}%`
                      : 'Accepted'
                    : 'Not accepted'}
                </Fact>
                <Fact label="Accepting now">{a.accepts_submissions_now ? 'Yes' : 'No'}</Fact>
                <Fact label="Published">
                  {a.published_at ? formatDateTime(a.published_at) : 'Not yet'}
                </Fact>
              </Facts>
            </Card>
          </aside>
        )}
      </div>

      {marking && (
        <MarkDialog
          assignmentId={a.id}
          max={a.max_score}
          submission={marking}
          onClose={() => setMarking(null)}
          onSaved={() => {
            settle('Mark saved')
            setMarking(null)
          }}
        />
      )}
    </PageStack>
  )
}

/** Sprig's figure block: quiet label, large tabular number, muted hint. */
function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-gray-900 tabular">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

/** Sprig's horizontal result bar: name, filled track, value on the right. */
function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-gray-800">{label}</span>
        <span className="shrink-0 text-xs text-gray-600 tabular">
          {score} / {max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn('h-full rounded-full', pct >= 50 ? 'bg-accent-500' : 'bg-brand-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function SubmissionCard({
  submission,
  max,
  canMark,
  onMark,
  onRelease,
}: {
  submission: AssignmentSubmission
  max: number
  canMark: boolean
  onMark: () => void
  onRelease: () => void
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={submission.student_name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {submission.student_name ?? 'Learner'}
            </p>
            <p className="text-xs text-gray-600">
              Attempt {submission.attempt_number} · {formatDateTime(submission.submitted_at)}
              {submission.is_late && <span className="text-danger-500"> · Late</span>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={submission.status} />
          {canMark && submission.status === 'marked' && (
            <Button size="sm" onClick={onRelease}>
              Release
            </Button>
          )}
          {canMark && (
            <Button size="sm" variant={submission.score === null ? 'primary' : 'secondary'} onClick={onMark}>
              {submission.score === null ? 'Mark' : 'Change mark'}
            </Button>
          )}
        </div>
      </div>

      {submission.body && (
        <div className="px-4 py-3">
          <p className="whitespace-pre-wrap text-sm text-gray-800">{submission.body}</p>
        </div>
      )}

      {submission.link_url && (
        <div className="px-4 pb-3">
          <a
            href={submission.link_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent-500 underline-offset-2 hover:underline"
          >
            {submission.link_url}
          </a>
        </div>
      )}

      {(submission.score !== null || submission.feedback) && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          {submission.score !== null && (
            <p className="text-sm text-gray-900">
              <span className="font-medium tabular">
                {submission.score} / {max}
              </span>
              {submission.marked_by && (
                <span className="text-gray-600"> · marked by {submission.marked_by}</span>
              )}
            </p>
          )}
          {submission.feedback && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{submission.feedback}</p>
          )}
        </div>
      )}
    </Card>
  )
}

const markSchema = z.object({
  score: z.string().optional(),
  feedback: z.string().optional(),
  release: z.boolean().optional(),
})

type MarkValues = z.infer<typeof markSchema>

function MarkDialog({
  assignmentId,
  submission,
  max,
  onClose,
  onSaved,
}: {
  assignmentId: string
  submission: AssignmentSubmission
  max: number
  onClose: () => void
  onSaved: () => void
}) {
  const form = useForm<MarkValues>({
    resolver: zodResolver(markSchema),
    defaultValues: {
      score: submission.score === null ? '' : String(submission.score),
      feedback: submission.feedback ?? '',
      release: true,
    },
  })
  const applyServerErrors = useServerErrors(form)

  const save = useMutation({
    mutationFn: (values: MarkValues) =>
      teachingApi.mark(assignmentId, submission.id, {
        score: values.score ? Number(values.score) : null,
        feedback: values.feedback?.trim() || null,
        release: values.release ?? false,
      }),
    onSuccess: onSaved,
    onError: applyServerErrors,
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Mark ${submission.student_name ?? 'this submission'}`}
      description={`Out of ${max}.`}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      submitLabel="Save mark"
    >
      <Field label="Score" error={form.formState.errors.score?.message}>
        {(props) => (
          <input
            {...props}
            type="number"
            min={0}
            max={max}
            step="0.5"
            className="h-8 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            {...form.register('score')}
          />
        )}
      </Field>

      <Field label="Feedback" error={form.formState.errors.feedback?.message}>
        {(props) => (
          <Textarea
            {...props}
            rows={4}
            placeholder="What was good, and what to do next time."
            {...form.register('feedback')}
          />
        )}
      </Field>

      <div className="flex items-start gap-2">
        <input
          id="release-now"
          type="checkbox"
          className="mt-0.5 h-4 w-4 cursor-pointer rounded-sm border border-gray-400 accent-brand-400"
          {...form.register('release')}
        />
        <label htmlFor="release-now" className="text-sm text-gray-800">
          Release to the learner now
          <span className="block text-xs text-gray-600">
            Without this the mark is saved but stays hidden from them.
          </span>
        </label>
      </div>
    </FormDialog>
  )
}

/* ── Learner ────────────────────────────────────────────────────────────── */

const submitSchema = z.object({ body: z.string().trim().min(1, 'Write your answer') })
type SubmitValues = z.infer<typeof submitSchema>

function LearnerAssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  const assignment = useQuery({
    queryKey: learningKeys.portal.assignment(assignmentId),
    queryFn: () => portalLearningApi.assignment(assignmentId),
  })

  const mine = useQuery({
    queryKey: learningKeys.portal.submissions(assignmentId),
    queryFn: () => portalLearningApi.submissions(assignmentId),
    enabled: assignment.isSuccess,
  })

  const form = useForm<SubmitValues>({ resolver: zodResolver(submitSchema), defaultValues: { body: '' } })
  const applyServerErrors = useServerErrors(form)

  const submit = useMutation({
    mutationFn: (values: SubmitValues) => portalLearningApi.submit(assignmentId, { body: values.body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningKeys.portal.all })
      toast.success('Handed in')
      setSubmitting(false)
      form.reset({ body: '' })
    },
    onError: applyServerErrors,
  })

  if (assignment.isError) {
    return (
      <PageStack>
        <ErrorState error={assignment.error} onRetry={() => assignment.refetch()} />
      </PageStack>
    )
  }
  if (assignment.isLoading || !assignment.data) {
    return (
      <PageStack>
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-40 w-full" />
      </PageStack>
    )
  }

  const a: Assignment = assignment.data
  const attempts = mine.data ?? []
  const attemptsLeft = a.max_attempts - attempts.length

  return (
    <PageStack>
      <Link
        to="/assignments"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft size={16} weight="bold" />
        All assignments
      </Link>

      <PageHeader
        title={a.title}
        icon={
          <EntityIcon tone="brand">
            <Notebook size={18} />
          </EntityIcon>
        }
        meta={
          <>
            <span>{a.course_title ?? 'Course'}</span>
            <MetaDot />
            <span>Out of {formatNumber(a.max_score)}</span>
            <MetaDot />
            <span className={a.is_overdue ? 'text-danger-500' : undefined}>
              Due {formatDateTime(a.due_at)}
            </span>
          </>
        }
        actions={
          a.accepts_submissions_now && attemptsLeft > 0 ? (
            <Button variant="primary" onClick={() => setSubmitting(true)}>
              Hand in
            </Button>
          ) : (
            <Badge tone={a.is_overdue ? 'danger' : 'neutral'}>
              {a.is_overdue ? 'Overdue' : 'Closed'}
            </Badge>
          )
        }
      />

      <Card>
        <CardHeader title="What to do" />
        <div className="px-4 py-3">
          {a.instructions ? (
            <p className="whitespace-pre-wrap text-sm text-gray-800">{a.instructions}</p>
          ) : (
            <p className="text-sm text-gray-600">No instructions were given.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Your work"
          subtitle={
            a.max_attempts > 1
              ? `${attempts.length} of ${a.max_attempts} attempts used`
              : undefined
          }
        />
        {attempts.length === 0 ? (
          <EmptyState
            title="Not handed in"
            description={
              a.accepts_submissions_now
                ? 'When you are ready, hand in your work above.'
                : 'This is no longer accepting submissions.'
            }
          />
        ) : (
          <ul className="divide-y divide-gray-200">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-600">
                    Attempt {attempt.attempt_number} · {formatDateTime(attempt.submitted_at)}
                    {attempt.is_late && <span className="text-danger-500"> · Late</span>}
                  </p>
                  <StatusBadge status={attempt.status} />
                </div>
                {attempt.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{attempt.body}</p>
                )}
                {/* `score` is null both when unmarked and when marked but not
                  * released, so `status` is what distinguishes them. */}
                {attempt.score !== null ? (
                  <div className="mt-3 rounded-md bg-gray-50 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900 tabular">
                      {attempt.score} / {a.max_score}
                    </p>
                    {attempt.feedback && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                        {attempt.feedback}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-600">
                    {attempt.status === 'submitted' ? 'Not marked yet.' : 'Mark not released yet.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FormDialog
        open={submitting}
        onClose={() => setSubmitting(false)}
        title="Hand in your work"
        description={a.is_overdue ? 'This is past its due date and will be marked late.' : undefined}
        form={form}
        onSubmit={(values) => submit.mutate(values)}
        pending={submit.isPending}
        submitLabel="Hand in"
        size="lg"
      >
        <Field label="Your answer" required error={form.formState.errors.body?.message}>
          {(props) => <Textarea {...props} rows={10} {...form.register('body')} />}
        </Field>
      </FormDialog>
    </PageStack>
  )
}
