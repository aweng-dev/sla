import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Exam as ExamIcon, Timer, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Pagination,
  Segmented,
  Skeleton,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatDateTime, formatNumber, formatRelative } from '@/shared/lib/format'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import { useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import { AttemptRunner } from './components/AttemptRunner'
import { AnswerVerdict } from './components/QuestionField'
import { examKeys, examsApi, type AttemptAnswer, type Exam, type ExamAttempt } from './exams.api'

/**
 * Tests, as the candidate meets them.
 *
 * ── Three states, and the screen is only ever in one ───────────────────────
 *
 * Choosing a paper, sitting one, and reading back a marked one. Sitting takes
 * over the whole screen: a candidate under a clock should not have a rail of
 * other papers to misclick, and every pixel that is not the question is a pixel
 * arguing for their attention.
 *
 * ── Start and resume are the same button, and the difference matters ───────
 *
 * `POST /exams/{id}/attempts` refuses with a 409 when a sitting is already in
 * progress — "continue it rather than starting another". So this screen looks
 * for that attempt first and resumes it, and only starts a new one when there
 * is none. Reaching the 409 would mean a candidate pressing Start and being
 * told off for it.
 *
 * ── `accepts_attempts_now` is the server's answer ──────────────────────────
 *
 * Never re-derived here from `opens_at` and `closes_at` against a device clock.
 * A client that worked it out itself would show an enabled button and then a
 * 409 — which, on an exam screen, reads as the system losing the paper.
 */
export function ExamsPage() {
  const t = useTerminology()
  const viewer = useViewer()

  return (
    <ModuleGate
      module="cbt"
      title="Tests"
      description={
        viewer.surface === 'learner'
          ? 'The tests you have been set, and the ones you have already sat.'
          : `Online tests set for the ${t('courses').toLowerCase()} you teach.`
      }
      offTitle="This institution does not run online tests"
      offDescription="Computer-based testing is switched off here. An administrator can enable it from the institution's modules."
    >
      <Candidate />
    </ModuleGate>
  )
}

function Candidate() {
  const queryClient = useQueryClient()

  const [scope, setScope] = useState<'open' | 'all'>('open')
  const [page, setPage] = useState(1)
  const [openExam, setOpenExam] = useState<Exam | null>(null)
  const [sittingId, setSittingId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<ExamAttempt | null>(null)

  const params = useMemo(() => ({ open_only: scope === 'open', page }), [scope, page])

  const exams = useQuery({
    queryKey: examKeys.list(params),
    queryFn: () => examsApi.exams(params),
    placeholderData: (previous) => previous,
    enabled: sittingId === null,
  })

  /* ── Sitting one takes the whole screen ───────────────────────────────── */
  if (sittingId !== null) {
    return (
      <AttemptRunner
        attemptId={sittingId}
        onFinished={(finished) => {
          setSittingId(null)
          setReviewing(finished)
          queryClient.invalidateQueries({ queryKey: examKeys.root })
        }}
      />
    )
  }

  if (reviewing !== null) {
    return <Review attempt={reviewing} onBack={() => setReviewing(null)} />
  }

  if (openExam !== null) {
    return (
      <ExamDetail
        exam={openExam}
        onBack={() => setOpenExam(null)}
        onSit={(attemptId) => setSittingId(attemptId)}
        onReview={(attempt) => setReviewing(attempt)}
      />
    )
  }

  if (exams.isError) {
    return (
      <Card>
        <ErrorState error={exams.error} onRetry={() => exams.refetch()} />
      </Card>
    )
  }

  const rows = exams.data?.rows ?? []

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Which tests to show"
        value={scope}
        onChange={(value) => {
          setScope(value as 'open' | 'all')
          setPage(1)
        }}
        options={[
          { value: 'open', label: 'Open now' },
          { value: 'all', label: 'All' },
        ]}
      />

      {exams.isLoading ? (
        <Card className="space-y-3 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ExamIcon size={20} />}
            title={scope === 'open' ? 'Nothing open right now' : 'No tests'}
            description={
              scope === 'open'
                ? 'A test appears here while its window is open. Switch to All to see ones you have already sat.'
                : 'Tests set for your courses appear here.'
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((exam) => (
            <li key={exam.id}>
              <ExamRow exam={exam} onOpen={() => setOpenExam(exam)} />
            </li>
          ))}
        </ul>
      )}

      {exams.data && exams.data.pagination.total > 0 && (
        <Pagination pagination={exams.data.pagination} onPageChange={setPage} />
      )}
    </div>
  )
}

function ExamRow({ exam, onOpen }: { exam: Exam; onOpen: () => void }) {
  return (
    <Card>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{exam.title}</span>
          <span className="block truncate text-2xs text-gray-600">
            {exam.course_title ?? 'Course'}
            {exam.question_count !== null && ` · ${formatNumber(exam.question_count)} questions`}
            {exam.is_timed &&
              exam.duration_minutes !== null &&
              ` · ${formatNumber(exam.duration_minutes)} minutes`}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {exam.closes_at && (
            <span className="text-2xs text-gray-500" title={formatDateTime(exam.closes_at)}>
              closes {formatRelative(exam.closes_at)}
            </span>
          )}
          {/* The server's own answer, never a window this screen re-computes. */}
          {exam.accepts_attempts_now ? (
            <Badge tone="success">Open</Badge>
          ) : (
            <Badge tone="neutral">Closed</Badge>
          )}
        </span>
      </button>
    </Card>
  )
}

function ExamDetail({
  exam,
  onBack,
  onSit,
  onReview,
}: {
  exam: Exam
  onBack: () => void
  onSit: (attemptId: string) => void
  onReview: (attempt: ExamAttempt) => void
}) {
  const queryClient = useQueryClient()

  const attempts = useQuery({
    queryKey: examKeys.attempts(exam.id),
    queryFn: () => examsApi.attempts(exam.id),
  })

  const sittings = attempts.data ?? []
  const inProgress = sittings.find((attempt) => attempt.status === 'in_progress') ?? null
  const used = sittings.filter((attempt) => attempt.status !== 'abandoned').length
  const left = Math.max(0, exam.max_attempts - used)

  const begin = useMutation({
    mutationFn: () => examsApi.start(exam.id),
    onSuccess: (attempt) => {
      queryClient.invalidateQueries({ queryKey: examKeys.root })
      onSit(attempt.id)
    },
    onError: (error) => {
      /* The server refuses with a sentence — a shut window, a used-up limit, a
       * sitting already open. It is more useful than anything invented here. */
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That test could not be started.',
      )
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft size={13} />
        All tests
      </button>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-900">{exam.title}</h2>
            <p className="mt-0.5 text-2xs text-gray-600">
              {exam.course_title}
              {exam.course_code && ` · ${exam.course_code}`}
            </p>
          </div>

          {/* Resume beats start: the API refuses a second sitting with a 409,
            * so reaching that would mean telling somebody off for pressing the
            * only button on the screen. */}
          {inProgress ? (
            <Button variant="primary" icon={<Timer size={15} />} onClick={() => onSit(inProgress.id)}>
              Continue your attempt
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!exam.accepts_attempts_now || left === 0}
              loading={begin.isPending}
              onClick={() => begin.mutate()}
            >
              {left === 0 ? 'No attempts left' : 'Start'}
            </Button>
          )}
        </div>

        {exam.instructions && (
          <p className="whitespace-pre-line border-b border-gray-200 px-4 py-3 text-sm leading-6 text-gray-800">
            {exam.instructions}
          </p>
        )}

        <Facts>
          <Fact label="Questions">
            {exam.question_count === null ? '—' : formatNumber(exam.question_count)}
          </Fact>
          <Fact label="Time">
            {exam.is_timed && exam.duration_minutes !== null
              ? `${formatNumber(exam.duration_minutes)} minutes`
              : 'No limit'}
          </Fact>
          <Fact label="Attempts">
            {formatNumber(used)} of {formatNumber(exam.max_attempts)} used
          </Fact>
          <Fact label="Opens">{exam.opens_at ? formatDateTime(exam.opens_at) : 'Already open'}</Fact>
          <Fact label="Closes">{exam.closes_at ? formatDateTime(exam.closes_at) : 'No closing time'}</Fact>
          {exam.passing_score_percent !== null && (
            <Fact label="Pass mark">{formatNumber(exam.passing_score_percent)}%</Fact>
          )}
          <Fact label="Late hand-in">
            {exam.allows_late_submission ? 'Accepted and flagged' : 'Not accepted'}
          </Fact>
        </Facts>
      </Card>

      <Card>
        <p className="border-b border-gray-200 px-4 py-2.5 text-xs font-medium text-gray-900">
          Your attempts
        </p>

        {attempts.isLoading ? (
          <div className="p-4" aria-hidden>
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sittings.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-500">
            You have not sat this yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {sittings.map((attempt) => (
              <li key={attempt.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-900">
                    Attempt {formatNumber(attempt.attempt_number)}
                  </span>
                  <span className="block text-2xs text-gray-600">
                    {attempt.submitted_at
                      ? `Handed in ${formatDateTime(attempt.submitted_at)}`
                      : 'In progress'}
                    {attempt.is_late && ' · late'}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  {/* A score arrives only once the sitting is released — before
                    * that there is nothing to show, not a zero. */}
                  {attempt.status === 'released' && attempt.percentage !== null && (
                    <span className="text-sm text-gray-900 tabular">
                      {formatNumber(attempt.percentage)}%
                    </span>
                  )}
                  {attempt.awaiting_marking && <Badge tone="neutral">Being marked</Badge>}
                  <Badge tone={attempt.status === 'released' ? 'success' : 'neutral'}>
                    {attempt.status_label}
                  </Badge>

                  {attempt.status === 'in_progress' ? (
                    <Button size="sm" onClick={() => onSit(attempt.id)}>
                      Continue
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => onReview(attempt)}>
                      Review
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/**
 * Reading a paper back.
 *
 * What is shown depends entirely on what the server sent: a score only once the
 * sitting is released, a correctness mark only where the paper reveals answers
 * as well. Absent fields are not "unknown" — they are "you are not being told",
 * and the screen stays quiet rather than guessing.
 */
function Review({ attempt, onBack }: { attempt: ExamAttempt; onBack: () => void }) {
  const fresh = useQuery({
    queryKey: examKeys.attempt(attempt.id),
    queryFn: () => examsApi.attempt(attempt.id),
    initialData: attempt,
  })

  const data = fresh.data ?? attempt
  const answers = (data.answers ?? []).slice().sort((a, b) => a.sequence - b.sequence)
  const released = data.status === 'released'

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft size={13} />
        Back
      </button>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-900">{data.exam_title}</h2>
            <p className="mt-0.5 text-2xs text-gray-600">
              Attempt {formatNumber(data.attempt_number)}
              {data.submitted_at && ` · handed in ${formatDateTime(data.submitted_at)}`}
              {data.is_late && data.seconds_late !== null && (
                <span className="text-danger-600">
                  {' '}
                  · {formatNumber(Math.ceil(data.seconds_late / 60))} minute(s) late
                </span>
              )}
            </p>
          </div>

          {released && data.percentage !== null ? (
            <span className="text-lg font-semibold text-gray-900 tabular">
              {formatNumber(data.percentage)}%
            </span>
          ) : (
            <Badge tone="neutral">
              {data.awaiting_marking ? 'Being marked' : 'Results not released yet'}
            </Badge>
          )}
        </div>

        {!released && (
          <p className="flex items-center gap-1.5 border-t border-gray-200 px-4 py-2 text-2xs text-gray-600">
            <Warning size={13} />
            {data.awaiting_marking
              ? 'Part of this paper needs a person to read it. Your marks appear once that is done and released.'
              : 'Your answers are recorded. Marks appear once the results are released.'}
          </p>
        )}
      </Card>

      <ul className="flex flex-col gap-3">
        {answers.map((answer, position) => (
          <li key={answer.id}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
                <p className="text-xs font-medium text-gray-900">
                  Question {formatNumber(position + 1)}
                </p>
                {released && <AnswerVerdict answer={answer} />}
              </div>

              <div className="px-4 py-3">
                <p className="whitespace-pre-line text-sm leading-6 text-gray-900">
                  {answer.prompt}
                </p>

                <div
                  className={cn(
                    'mt-3 rounded-md border border-gray-200 px-3 py-2 text-sm',
                    answer.response ? 'text-gray-900' : 'text-gray-500',
                  )}
                >
                  <span className="block text-2xs text-gray-500">Your answer</span>
                  <YourAnswer answer={answer} />
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the candidate put, read back in the words of the paper they saw. */
function YourAnswer({ answer }: { answer: AttemptAnswer }) {
  const response = answer.response

  if (!response) return <span>Not answered</span>

  if (answer.type === 'multiple_choice') {
    const chosen = answer.options.find((option) => option.id === response.option_id)
    return <span>{chosen?.content ?? 'Not answered'}</span>
  }

  if (answer.type === 'true_false') {
    return <span>{response.value === true ? 'True' : response.value === false ? 'False' : 'Not answered'}</span>
  }

  if (answer.type === 'matching') {
    const pairs = response.pairs ?? {}
    const lines = answer.options.map((left) => {
      const right = answer.match_options.find((option) => option.id === pairs[left.id])
      return `${left.content} → ${right?.content ?? '—'}`
    })
    return <span className="whitespace-pre-line">{lines.join('\n')}</span>
  }

  return <span className="whitespace-pre-line">{response.text?.trim() || 'Not answered'}</span>
}
