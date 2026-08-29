import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { CaretLeft, CaretRight, LockSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button, Card, EmptyState, Skeleton, Tooltip } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatNumber, formatPercent } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  ATTENDANCE_STATUSES,
  CYCLE,
  attendanceApi,
  attendanceKeys,
  type AttendanceStatus,
} from '../attendance.api'
import type { AttendanceByDay, AttendanceByLearner } from '../classroom.api'

/**
 * The register sheet: names down, days across, one mark in each cell.
 *
 * ── Why a grid and not two lists ───────────────────────────────────────────
 *
 * The two questions a register answers are "who is missing lessons" and "what
 * happened on Tuesday", and both are patterns rather than totals. A list of
 * learners with percentages answers the first badly and the second not at all;
 * a grid answers both by being looked at — a row with gaps in it is a child to
 * ring home about, a column with gaps is a day something happened.
 *
 * ── The matrix is assembled here, because the API sends two halves ─────────
 *
 * The group report gives the DAYS (with their session ids) and the LEARNERS
 * (with their totals), and no cell between them. The marks live on each
 * session, so this fetches the sessions for the days on screen and joins them.
 * Ten columns is ten small cached requests, which is why the window pages.
 *
 * A `by_learner` row with no session record is genuinely unmarked — the blank
 * is a fact, not a loading state, and it is drawn differently from both.
 *
 * ── Correcting a mark is one click, and it writes immediately ──────────────
 *
 * There is no save button on the sheet. Editing here is fixing one cell that is
 * wrong — a note from a parent, a late arrival logged as absent — and holding
 * that in a draft until somebody presses save is how a correction gets lost.
 * The live register on the roll is the opposite case and batches deliberately.
 *
 * ── A finalised day is read-only, and says so ──────────────────────────────
 *
 * Closing a register is a decision. The sheet shows those columns with a lock
 * rather than hiding them or silently swallowing clicks.
 */
export function AttendanceSheet({
  days,
  learners,
  pageSize,
}: {
  /** Newest-first from the API; the sheet reverses so time runs left to right. */
  days: AttendanceByDay[]
  learners: AttendanceByLearner[]
  pageSize: number
}) {
  const t = useTerminology()
  const queryClient = useQueryClient()

  const [window, setWindow] = useState(0)

  /* Oldest first: a sheet is read the way a week is. */
  const ordered = useMemo(
    () =>
      days
        .slice()
        .sort((a, b) => a.session_date.localeCompare(b.session_date)),
    [days],
  )

  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize))
  const page = Math.min(window, pageCount - 1)
  const visible = ordered.slice(page * pageSize, page * pageSize + pageSize)

  /* One request per column on screen. Cached, so paging back is free. */
  const sessions = useQueries({
    queries: visible.map((day) => ({
      queryKey: attendanceKeys.session(day.session_id),
      queryFn: () => attendanceApi.session(day.session_id),
      staleTime: 30_000,
    })),
  })

  const loading = sessions.some((query) => query.isLoading)

  /** session id → student id → status. */
  const marks = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceStatus>>()

    sessions.forEach((query, index) => {
      const day = visible[index]
      if (!day) return

      const inner = new Map<string, AttendanceStatus>()
      for (const record of query.data?.records ?? []) inner.set(record.student_id, record.status)
      map.set(day.session_id, inner)
    })

    return map
  }, [sessions, visible])

  const locked = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach((query, index) => {
      if (query.data?.is_finalised) set.add(visible[index]!.session_id)
    })
    return set
  }, [sessions, visible])

  const change = useMutation({
    mutationFn: ({
      sessionId,
      studentId,
      status,
    }: {
      sessionId: string
      studentId: string
      status: AttendanceStatus
    }) => attendanceApi.mark(sessionId, { student_id: studentId, status }),
    onSuccess: (_record, variables) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.session(variables.sessionId) })
      /* The totals down the side and along the top are the report's, so it has
       * to be refetched too — a corrected mark that left the percentage alone
       * would be a sheet disagreeing with itself. */
      queryClient.invalidateQueries({ queryKey: ['admin', 'learning-groups'] })
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That mark could not be changed.',
      )
    },
  })

  if (ordered.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No registers in this window"
          description="Widen the dates, or take a register from the roll."
        />
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Register sheet</h3>
          <p className="mt-0.5 text-2xs text-gray-600">
            Click a cell to change a mark. {CYCLE.map((value) => ATTENDANCE_STATUSES.find((s) => s.value === value)?.label).join(' → ')}.
          </p>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              aria-label="Earlier days"
              disabled={page === 0}
              onClick={() => setWindow((current) => Math.max(0, current - 1))}
            >
              <CaretLeft size={14} />
            </Button>
            <span className="text-2xs text-gray-600 tabular">
              {formatNumber(page * pageSize + 1)}–
              {formatNumber(page * pageSize + visible.length)} of {formatNumber(ordered.length)}
            </span>
            <Button
              size="icon"
              aria-label="Later days"
              disabled={page >= pageCount - 1}
              onClick={() => setWindow((current) => Math.min(pageCount - 1, current + 1))}
            >
              <CaretRight size={14} />
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 p-4" aria-hidden>
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Attendance for each {t('learner').toLowerCase()} on each day in the window
            </caption>
            <thead>
              <tr>
                {/* Sticky, because a name is what a cell means. Scrolling a
                  * grid of dots away from its labels makes it unreadable. */}
                <th
                  scope="col"
                  className="sticky left-0 z-10 border-b border-gray-200 bg-white px-4 py-2 text-left text-2xs font-medium text-gray-600"
                >
                  {t('learner')}
                </th>

                {visible.map((day) => (
                  <th
                    key={day.session_id}
                    scope="col"
                    className="border-b border-gray-200 px-1 py-2 text-center text-2xs font-medium text-gray-600"
                  >
                    <span className="block whitespace-nowrap">{shortDate(day.session_date)}</span>
                    {locked.has(day.session_id) && (
                      <LockSimple
                        size={10}
                        weight="fill"
                        className="mx-auto mt-0.5 text-gray-400"
                        aria-label="Closed"
                      />
                    )}
                  </th>
                ))}

                <th
                  scope="col"
                  className="border-b border-gray-200 px-3 py-2 text-right text-2xs font-medium text-gray-600"
                >
                  In window
                </th>
              </tr>
            </thead>

            <tbody>
              {learners.map((learner) => (
                <tr key={learner.student_id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 min-w-[11rem] max-w-[14rem] border-b border-gray-100 bg-white px-4 py-1.5 text-left font-normal group-hover:bg-gray-50"
                  >
                    <span className="block truncate text-sm text-gray-900">{learner.name}</span>
                    <span className="block truncate text-2xs text-gray-500">
                      {learner.student_number}
                    </span>
                  </th>

                  {visible.map((day) => {
                    const status = marks.get(day.session_id)?.get(learner.student_id) ?? null
                    const shut = locked.has(day.session_id)

                    return (
                      <td
                        key={day.session_id}
                        className="border-b border-gray-100 px-1 py-1.5 text-center group-hover:bg-gray-50"
                      >
                        <Cell
                          status={status}
                          locked={shut}
                          busy={
                            change.isPending &&
                            change.variables?.sessionId === day.session_id &&
                            change.variables?.studentId === learner.student_id
                          }
                          label={`${learner.name}, ${formatDate(day.session_date)}`}
                          onCycle={() => {
                            if (shut) return
                            const index = status ? CYCLE.indexOf(status) : -1
                            change.mutate({
                              sessionId: day.session_id,
                              studentId: learner.student_id,
                              status: CYCLE[(index + 1) % CYCLE.length],
                            })
                          }}
                        />
                      </td>
                    )
                  })}

                  <td className="border-b border-gray-100 px-3 py-1.5 text-right group-hover:bg-gray-50">
                    <span
                      className={cn(
                        'text-xs tabular',
                        learner.counts.attendance_percentage < 85
                          ? 'font-semibold text-danger-600'
                          : 'text-gray-900',
                      )}
                    >
                      {formatPercent(learner.counts.attendance_percentage / 100)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Legend />
    </Card>
  )
}

/**
 * One mark.
 *
 * A letter rather than a colour alone, for the reason the roll's status pill
 * gives: a sheet read by somebody who cannot distinguish red from green is
 * still a sheet. The letter is what carries it; the tint is the shortcut.
 */
function Cell({
  status,
  locked,
  busy,
  label,
  onCycle,
}: {
  status: AttendanceStatus | null
  locked: boolean
  busy: boolean
  label: string
  onCycle: () => void
}) {
  const entry = ATTENDANCE_STATUSES.find((option) => option.value === status)

  const body = (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-2xs font-semibold transition-colors',
        busy && 'opacity-50',
        status === null && 'text-gray-300',
        status === 'present' && 'bg-success-50 text-success-700',
        status === 'absent' && 'bg-danger-50 text-danger-600',
        status === 'late' && 'bg-brand-100 text-gray-900',
        (status === 'excused' || status === 'left_early') && 'bg-gray-100 text-gray-700',
      )}
    >
      {entry?.short ?? '·'}
    </span>
  )

  if (locked) {
    return (
      <Tooltip side="top" content={`${label} — this register is closed`}>
        <span className="inline-flex cursor-not-allowed">{body}</span>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      onClick={onCycle}
      disabled={busy}
      aria-label={`${label} — ${entry?.label ?? 'not marked'}. Press to change.`}
      className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
    >
      {body}
    </button>
  )
}

/** What the letters mean, said once rather than in every cell's tooltip. */
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-200 px-4 py-2.5">
      {ATTENDANCE_STATUSES.map((option) => (
        <span key={option.value} className="inline-flex items-center gap-1.5 text-2xs text-gray-600">
          <span
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded text-[9px] font-semibold',
              option.value === 'present' && 'bg-success-50 text-success-700',
              option.value === 'absent' && 'bg-danger-50 text-danger-600',
              option.value === 'late' && 'bg-brand-100 text-gray-900',
              (option.value === 'excused' || option.value === 'left_early') &&
                'bg-gray-100 text-gray-700',
            )}
          >
            {option.short}
          </span>
          {option.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-2xs text-gray-500">
        <span className="flex h-4 w-4 items-center justify-center rounded text-[9px] text-gray-300">
          ·
        </span>
        Not marked
      </span>
    </div>
  )
}

/** "Mon 12" — enough to find a day in a fortnight without widening the column. */
function shortDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric' }).format(parsed)
}
