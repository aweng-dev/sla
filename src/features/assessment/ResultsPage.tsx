import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calculator, CheckCircle, LockKeyOpen, LockSimple, PaperPlaneTilt } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Modal,
  Pagination,
  ReasonDialog,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { usePermissions, useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import { MyResults } from '@/features/portal/components/MyResults'
import { gradebookApi, gradebookKeys, type GradebookSummary } from './gradebook.api'

/**
 * Turning marks into results, and releasing them.
 *
 * ── Four steps, and the separation is the whole point ──────────────────────
 *
 * Calculate turns scores into course grades. Approve says a human has checked
 * them. Publish releases them to learners and, optionally, to guardians. Each
 * is a separate endpoint authorized against the permission that names it, which
 * is how a class teacher ends up able to calculate and not to release.
 *
 * The screen draws them as an ordered run rather than four equal buttons,
 * because they are not four things you can do — they are one thing you do in
 * order, and the step you are on is the only one that should look pressable.
 *
 * ── Unlock is the one that asks why ────────────────────────────────────────
 *
 * Reopening a published result is the single action somebody will later be
 * asked to account for, and the API demands a reason. So does this.
 *
 * ── Gated on `gradebook`, not on `results` ─────────────────────────────────
 *
 * The API puts this workflow inside the gradebook group: calculating and
 * publishing are acts ON a mark book, and `module:results` gates only the
 * learner-facing `/portal/results`. Gating this screen on `results` would draw
 * it for institutions whose endpoints answer 402.
 */
export function ResultsPage() {
  const viewer = useViewer()

  /*
   * `gradebook` and `results` both list `student_self` and
   * `guardian_children` among their access profiles, so the rail draws
   * these for a learner and their family. What a learner has is not a
   * marking grid or a publish button — it is the marks that were actually
   * RELEASED to them, which is a different endpoint and a different screen.
   */
  const learner = viewer.surface === 'learner'

  const t = useTerminology()

  return (
    <ModuleGate
      module="gradebook"
      title="Results"
      description={
        learner
          ? 'The results your institution has released to you.'
          : `Work marks into results, check them, and release them to ${t('learners').toLowerCase()} and their families.`
      }
      offTitle="This institution does not run results"
      offDescription="Results are worked out from a gradebook, and the gradebook module is switched off here. An administrator can enable it from the institution's modules."
    >
      {learner ? (
        <MyResults />
      ) : (
        <>
      <Workspace />
        </>
      )}
    </ModuleGate>
  )
}

function Workspace() {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const params = useMemo(() => ({ page }), [page])

  const books = useQuery({
    queryKey: gradebookKeys.list(params),
    queryFn: () => gradebookApi.list(params),
    placeholderData: (previous) => previous,
  })

  const rows = books.data?.rows ?? []

  useEffect(() => {
    if (selectedId !== null || rows.length === 0) return
    setSelectedId(rows[0].id)
  }, [rows, selectedId])

  const selected = rows.find((row) => row.id === selectedId) ?? null

  if (books.isError) {
    return (
      <Card>
        <ErrorState error={books.error} onRetry={() => books.refetch()} />
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <Card className="h-fit">
        <div className="max-h-[30rem] overflow-y-auto px-2 py-2">
          {books.isLoading && (
            <ul aria-hidden>
              {['w-3/4', 'w-2/3', 'w-1/2'].map((width, index) => (
                <li key={index} className="space-y-1.5 px-2 py-2">
                  <Skeleton className={cn('h-3', width)} />
                  <Skeleton className="h-2.5 w-20" />
                </li>
              ))}
            </ul>
          )}

          {!books.isLoading && rows.length === 0 && (
            <EmptyState
              title="No gradebooks"
              description="Results are worked out from a gradebook. You see the ones you teach."
            />
          )}

          <ul className="flex flex-col gap-0.5">
            {rows.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(book.id)}
                  aria-current={book.id === selectedId ? 'true' : undefined}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
                    book.id === selectedId ? 'bg-rail-active' : 'hover:bg-gray-50',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">
                      {book.course_title ?? book.course_offering_code ?? 'Untitled'}
                    </span>
                    {book.is_published ? (
                      <Badge tone="success">Out</Badge>
                    ) : book.is_locked ? (
                      <LockSimple size={12} className="shrink-0 text-gray-500" />
                    ) : null}
                  </span>
                  <span className="truncate text-2xs text-gray-500">
                    {[book.learning_group_name, book.academic_period_name]
                      .filter(Boolean)
                      .join(' · ') || book.course_code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {books.data && books.data.pagination.total > 0 && (
          <Pagination
            className="border-t border-gray-200 px-3"
            pagination={books.data.pagination}
            onPageChange={setPage}
          />
        )}
      </Card>

      {selected ? (
        <Workflow key={selected.id} book={selected} />
      ) : (
        <Card className="flex items-center justify-center py-16">
          <EmptyState
            title="Pick a gradebook"
            description="Its results workflow appears here."
          />
        </Card>
      )}
    </div>
  )
}

function Workflow({ book }: { book: GradebookSummary }) {
  const t = useTerminology()
  const permissions = usePermissions()
  const queryClient = useQueryClient()

  const canCalculate = permissions.hasAny('gradebook.manage', 'results.manage')
  const canApprove = permissions.has('results.manage')
  const canPublish = permissions.has('results.manage')

  const [publishing, setPublishing] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: gradebookKeys.root })
  }

  const calculate = useMutation({
    mutationFn: () => gradebookApi.calculate(book.id),
    onSuccess: (result) => {
      refresh()
      const count = Array.isArray(result) ? result.length : 0
      toast.success(
        count === 0
          ? 'Nothing to work out — no marks count toward a final grade yet.'
          : `${formatNumber(count)} ${count === 1 ? 'result' : 'results'} worked out.`,
      )
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Those could not be worked out.')
    },
  })

  const approve = useMutation({
    mutationFn: () => gradebookApi.approve(book.id),
    onSuccess: () => {
      refresh()
      toast.success('Approved. Nothing is released until you publish.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Those could not be approved.')
    },
  })

  const publish = useMutation({
    mutationFn: (toGuardians: boolean) => gradebookApi.publish(book.id, toGuardians),
    onSuccess: () => {
      refresh()
      setPublishing(false)
      toast.success('Published.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Those could not be published.')
    },
  })

  const unlock = useMutation({
    mutationFn: (reason: string) => gradebookApi.unlock(book.id, reason),
    onSuccess: () => {
      refresh()
      setUnlocking(false)
      toast.success('Reopened. The reason is on the record.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be reopened.')
    },
  })

  /*
   * Where this book has got to. Derived from the server's own flags rather than
   * a status string this screen parses: `is_locked` and `is_published` are the
   * two facts the API states, and everything before them is "still open".
   */
  const stage = book.is_published ? 'published' : book.is_locked ? 'approved' : 'open'

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader
            title={book.course_title ?? book.course_offering_code ?? 'Gradebook'}
            subtitle={[book.learning_group_name, book.academic_session_name, book.academic_period_name]
              .filter(Boolean)
              .join(' · ')}
            actions={
              <div className="flex items-center gap-2">
                <StatusBadge status={book.status} />
                {book.is_published && <Badge tone="success">Published</Badge>}
              </div>
            }
          />

          <Facts>
            <Fact label="Assessments">
              {book.assessments_count === undefined ? '—' : formatNumber(book.assessments_count)}
            </Fact>
            <Fact label="Closed">
              {book.locked_at ? formatDateTime(book.locked_at) : 'Still open'}
            </Fact>
            <Fact label="Published">
              {book.published_at ? formatDateTime(book.published_at) : 'Not yet'}
            </Fact>
            <Fact label={`Visible to ${t('learners').toLowerCase()}`}>
              {book.is_visible_to_students ? 'Yes' : 'No'}
            </Fact>
            <Fact label={`Visible to ${t('guardians').toLowerCase()}`}>
              {book.is_visible_to_guardians ? 'Yes' : 'No'}
            </Fact>
          </Facts>
        </Card>

        {/* ── The run, in order ────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Working the results"
            subtitle="Each step is a separate decision, and a separate permission."
          />

          <ol className="divide-y divide-gray-200">
            <Step
              index={1}
              title="Work out the marks"
              body="Turns the scores in this book into a percentage, a letter and a grade point for every learner, using the scheme attached to it."
              done={stage !== 'open'}
              current={stage === 'open'}
              action={
                canCalculate ? (
                  <Button
                    size="sm"
                    icon={<Calculator size={14} />}
                    loading={calculate.isPending}
                    onClick={() => calculate.mutate()}
                  >
                    Calculate
                  </Button>
                ) : undefined
              }
            />

            <Step
              index={2}
              title="Check and approve"
              body="Says a person has read them. Nothing is released by approving, and the book closes to further marking."
              done={stage === 'published'}
              current={stage === 'approved'}
              action={
                canApprove && stage !== 'published' ? (
                  <Button
                    size="sm"
                    icon={<CheckCircle size={14} />}
                    loading={approve.isPending}
                    onClick={() => approve.mutate()}
                  >
                    Approve
                  </Button>
                ) : undefined
              }
            />

            <Step
              index={3}
              title="Release"
              body={`Puts the results in front of ${t('learners').toLowerCase()}, and their families if you say so. This is the step people see.`}
              done={stage === 'published'}
              current={stage === 'approved'}
              action={
                canPublish && stage !== 'published' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<PaperPlaneTilt size={14} />}
                    onClick={() => setPublishing(true)}
                  >
                    Publish
                  </Button>
                ) : undefined
              }
            />
          </ol>

          {book.is_locked && canApprove && (
            <div className="border-t border-gray-200 px-4 py-3">
              <Button
                size="sm"
                variant="ghost"
                icon={<LockKeyOpen size={14} />}
                onClick={() => setUnlocking(true)}
              >
                Reopen this gradebook
              </Button>
              <p className="mt-1 text-2xs text-gray-500">
                Asks for a reason, and keeps it. Reopening a released result is the one action
                somebody will be asked to account for.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Two audiences, one decision, asked once. */}
      <Modal
        open={publishing}
        onClose={() => setPublishing(false)}
        title="Release these results"
        description="They become visible immediately. Withdrawing them means reopening the gradebook, which asks for a reason."
        footer={
          <>
            <Button onClick={() => setPublishing(false)}>Cancel</Button>
            <Button
              loading={publish.isPending && publish.variables === false}
              onClick={() => publish.mutate(false)}
            >
              {t('learners')} only
            </Button>
            <Button
              variant="primary"
              loading={publish.isPending && publish.variables === true}
              onClick={() => publish.mutate(true)}
            >
              {t('learners')} and {t('guardians').toLowerCase()}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          Publishing to families as well is the usual choice, and it is what the API does when
          nothing says otherwise.
        </p>
      </Modal>

      <ReasonDialog
        open={unlocking}
        title="Reopen this gradebook"
        description="Marks can be changed again. The reason is kept against the record."
        confirmLabel="Reopen"
        destructive
        pending={unlock.isPending}
        onClose={() => setUnlocking(false)}
        onConfirm={(reason) => unlock.mutate(reason)}
      />
    </>
  )
}

function Step({
  index,
  title,
  body,
  done,
  current,
  action,
}: {
  index: number
  title: string
  body: string
  done: boolean
  current: boolean
  action?: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular',
          done
            ? 'bg-success-500 text-white'
            : current
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-500',
        )}
        aria-hidden
      >
        {done ? <CheckCircle size={13} weight="fill" /> : index}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', current ? 'font-medium text-gray-900' : 'text-gray-900')}>
          {title}
        </p>
        <p className="mt-0.5 text-2xs text-gray-600">{body}</p>
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </li>
  )
}
