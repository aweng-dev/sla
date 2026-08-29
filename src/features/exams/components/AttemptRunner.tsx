import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretLeft, CaretRight, CloudCheck, CloudSlash, Timer, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge, Button, Card, ErrorState, Modal, Skeleton } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import {
  answeredCount,
  examKeys,
  examsApi,
  hasResponse,
  type AnswerResponse,
  type ExamAttempt,
} from '../exams.api'
import { formatClock, useExamClock } from '../useExamClock'
import { QuestionField } from './QuestionField'

/**
 * Sitting the paper.
 *
 * ── The one requirement everything else serves ─────────────────────────────
 *
 * An answer a candidate has given must not be lost. Everything below follows
 * from that:
 *
 *   A choice saves the moment it is made — a radio, a select, a true/false —
 *   because there is no reason to wait and every second of waiting is a second
 *   in which a laptop can close.
 *
 *   Typing saves on a short debounce and again on blur, and the screen says out
 *   loud whether what is on it has reached the server. "Saving…" and "Saved"
 *   are not decoration on an exam screen; they are the answer to the only
 *   question a candidate has when the clock is red.
 *
 *   Moving between questions flushes anything pending FIRST. A candidate who
 *   types and immediately clicks Next must not outrun their own save.
 *
 *   Time running out flushes, then submits. The server accepts a late paper
 *   and flags it, so a second's overrun costs a note on the record rather than
 *   the paper — but the flush is what makes the last sentence part of it.
 *
 * ── The clock is the server's, ticked locally ──────────────────────────────
 *
 * See `useExamClock`. Every save answers with the whole attempt, so the
 * countdown re-anchors to the server on every answer given.
 *
 * ── Leaving the page is guarded ────────────────────────────────────────────
 *
 * A `beforeunload` handler while anything is unsaved. It is a blunt instrument
 * and browsers word it themselves, but a candidate who closes a tab mid-essay
 * gets one chance to not do that.
 */
export function AttemptRunner({
  attemptId,
  onFinished,
}: {
  attemptId: string
  onFinished: (attempt: ExamAttempt) => void
}) {
  const queryClient = useQueryClient()

  const [index, setIndex] = useState(0)
  const [confirming, setConfirming] = useState(false)

  /** Answers typed but not yet acknowledged by the server, by answer id. */
  const pending = useRef<Map<string, AnswerResponse | null>>(new Map())
  const debounce = useRef<number | null>(null)
  const [unsaved, setUnsaved] = useState(0)
  const submitted = useRef(false)

  const attempt = useQuery({
    queryKey: examKeys.attempt(attemptId),
    queryFn: () => examsApi.attempt(attemptId),
    /* No polling. The clock is local and every save re-anchors it; refetching
     * under a candidate would replace the paper they are reading. */
    refetchOnWindowFocus: false,
  })

  const data = attempt.data
  const answers = useMemo(
    () => (data?.answers ?? []).slice().sort((a, b) => a.sequence - b.sequence),
    [data?.answers],
  )

  const clock = useExamClock(data?.seconds_remaining)
  const live = data?.status === 'in_progress'

  const save = useMutation({
    mutationFn: ({ answerId, response }: { answerId: string; response: AnswerResponse | null }) =>
      examsApi.saveAnswer(attemptId, answerId, response),
    onSuccess: (fresh, variables) => {
      /* Only clear the pending entry if nothing newer has been typed since this
       * request left — otherwise a slow response would erase a later keystroke
       * from the queue and it would never be sent. */
      if (pending.current.get(variables.answerId) === variables.response) {
        pending.current.delete(variables.answerId)
        setUnsaved(pending.current.size)
      }

      /* The response carries the whole attempt, which re-anchors the clock. */
      queryClient.setQueryData(examKeys.attempt(attemptId), fresh)
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.rootMessage()
          : 'That answer did not reach the server. Check your connection — it will be retried when you move on.',
      )
    },
  })

  /** Send everything queued, and wait for it. */
  const flush = useCallback(async () => {
    if (debounce.current !== null) {
      window.clearTimeout(debounce.current)
      debounce.current = null
    }

    const queued = Array.from(pending.current.entries())
    if (queued.length === 0) return

    /* Sequential, not parallel: two writes to the same attempt racing would
     * each answer with a different view of it, and the last one home would win
     * the clock. */
    for (const [answerId, response] of queued) {
      try {
        await save.mutateAsync({ answerId, response })
      } catch {
        /* Reported by onError. Keep going — one failed answer must not stop
         * the rest from being saved. */
      }
    }
  }, [save])

  const submit = useMutation({
    mutationFn: async () => {
      await flush()
      return examsApi.submit(attemptId)
    },
    onSuccess: (finished) => {
      submitted.current = true
      pending.current.clear()
      setUnsaved(0)
      queryClient.setQueryData(examKeys.attempt(attemptId), finished)
      queryClient.invalidateQueries({ queryKey: examKeys.root })
      setConfirming(false)

      toast.success(
        finished.is_late && finished.seconds_late
          ? `Handed in ${formatNumber(Math.ceil(finished.seconds_late / 60))} minute(s) late. It has been recorded.`
          : 'Handed in.',
      )

      onFinished(finished)
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That paper was not handed in. Try again.',
      )
    },
  })

  /*
   * Time up: flush, then hand in. Guarded by a ref rather than by state so a
   * re-render during the request cannot fire a second submission.
   */
  useEffect(() => {
    if (!live || !clock.expired || submitted.current || submit.isPending) return

    submitted.current = true
    submit.mutate()
  }, [live, clock.expired, submit])

  /* One chance to not close the tab mid-answer. */
  useEffect(() => {
    if (!live || unsaved === 0) return

    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', guard)

    return () => window.removeEventListener('beforeunload', guard)
  }, [live, unsaved])

  function queue(answerId: string, response: AnswerResponse | null) {
    pending.current.set(answerId, response)
    setUnsaved(pending.current.size)

    if (debounce.current !== null) window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      debounce.current = null
      void flush()
    }, 700)
  }

  function commit(answerId: string, response: AnswerResponse | null) {
    pending.current.set(answerId, response)
    setUnsaved(pending.current.size)
    void flush()
  }

  async function move(to: number) {
    await flush()
    setIndex(to)
  }

  if (attempt.isError) {
    return (
      <Card>
        <ErrorState error={attempt.error} onRetry={() => attempt.refetch()} />
      </Card>
    )
  }

  if (attempt.isLoading || !data) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
      </Card>
    )
  }

  const current = answers[index]
  const done = answeredCount(data)
  const readOnly = !live || clock.expired

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        {/* ── The clock, and whether the work is safe ─────────────────── */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-gray-900">{data.exam_title}</h2>
              <p className="mt-0.5 text-2xs text-gray-600">
                Attempt {formatNumber(data.attempt_number)} · {formatNumber(done)} of{' '}
                {formatNumber(answers.length)} answered
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {/* Said out loud, because on an exam screen this is the only
                * question a candidate actually has. */}
              {live &&
                (unsaved > 0 || save.isPending ? (
                  <span className="inline-flex items-center gap-1.5 text-2xs text-gray-600">
                    <CloudSlash size={14} />
                    Saving…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-2xs text-success-600">
                    <CloudCheck size={14} />
                    Saved
                  </span>
                ))}

              {clock.remaining !== null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold tabular',
                    clock.remaining <= 60
                      ? 'bg-danger-50 text-danger-600'
                      : clock.remaining <= 300
                        ? 'bg-brand-100 text-gray-900'
                        : 'bg-gray-100 text-gray-900',
                  )}
                  /* Announced sparingly: a live region that spoke every second
                   * would make a screen reader unusable for the whole paper. */
                  aria-live={clock.remaining <= 60 ? 'assertive' : 'off'}
                >
                  <Timer size={15} weight="bold" />
                  {formatClock(clock.remaining)}
                </span>
              )}

              {live && (
                <Button
                  variant="primary"
                  loading={submit.isPending}
                  onClick={() => setConfirming(true)}
                >
                  Hand in
                </Button>
              )}
            </div>
          </div>

          {clock.remaining !== null && clock.remaining <= 60 && live && (
            <p className="flex items-center gap-1.5 border-t border-gray-200 px-4 py-2 text-2xs text-danger-600">
              <Warning size={13} weight="fill" />
              Under a minute left. Your paper will be handed in automatically when the time is up.
            </p>
          )}
        </Card>

        {/* ── The question ────────────────────────────────────────────── */}
        {current ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
              <p className="text-xs font-medium text-gray-900">
                Question {formatNumber(index + 1)} of {formatNumber(answers.length)}
                {current.section && <span className="text-gray-500"> · {current.section}</span>}
              </p>
              <Badge tone="neutral">
                {formatNumber(current.max_score)} {current.max_score === 1 ? 'mark' : 'marks'}
              </Badge>
            </div>

            <div className="px-4 py-4">
              <p className="whitespace-pre-line text-sm leading-6 text-gray-900">
                {current.prompt}
              </p>

              <div className="mt-4">
                <QuestionField
                  answer={current}
                  readOnly={readOnly}
                  onChange={(response) => queue(current.id, response)}
                  onCommit={(response) => commit(current.id, response)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-2.5">
              <Button
                icon={<CaretLeft size={14} />}
                disabled={index === 0}
                onClick={() => void move(index - 1)}
              >
                Previous
              </Button>
              <Button
                trailing={<CaretRight size={14} />}
                disabled={index >= answers.length - 1}
                onClick={() => void move(index + 1)}
              >
                Next
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              This paper has no questions.
            </p>
          </Card>
        )}

        {/* ── Where everything is ─────────────────────────────────────── */}
        <Card>
          <p className="border-b border-gray-200 px-4 py-2.5 text-xs font-medium text-gray-900">
            All questions
          </p>
          <div className="flex flex-wrap gap-1.5 px-4 py-3">
            {answers.map((answer, position) => {
              const answered = hasResponse(answer.response) || pending.current.has(answer.id)

              return (
                <button
                  key={answer.id}
                  type="button"
                  aria-label={`Question ${position + 1}${answered ? ', answered' : ', not answered'}`}
                  aria-current={position === index ? 'true' : undefined}
                  onClick={() => void move(position)}
                  className={cn(
                    'h-8 w-8 rounded-md text-xs tabular transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                    position === index
                      ? 'bg-gray-900 font-semibold text-white'
                      : answered
                        ? 'bg-rail-active text-gray-900'
                        : 'border border-gray-200 text-gray-500 hover:bg-gray-50',
                  )}
                >
                  {position + 1}
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Hand in this paper"
        description="You cannot go back to it afterwards."
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Keep working</Button>
            <Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
              Hand in
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          {done === answers.length
            ? `All ${formatNumber(answers.length)} questions have an answer.`
            : `${formatNumber(answers.length - done)} of ${formatNumber(answers.length)} questions have no answer yet. They will be marked as unanswered.`}
        </p>
      </Modal>
    </>
  )
}
