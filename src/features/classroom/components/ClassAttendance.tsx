import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarBlank, ClipboardText, Warning } from '@phosphor-icons/react'
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Pagination,
  Segmented,
  Skeleton,
  StatTile,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatNumber, formatPercent } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { AttendanceSheet } from './AttendanceSheet'
import {
  CLASS_PAGE_SIZE,
  classroomApi,
  classroomKeys,
  type AttendanceByLearner,
} from '../classroom.api'

/**
 * The attendance sheet.
 *
 * ── `ever_taken` is the difference between two identical-looking zeros ─────
 *
 * "Nobody has been absent" and "nobody has taken a register" produce the same
 * totals and mean opposite things. The server says which, and this screen says
 * it out loud rather than reporting 100% attendance for a class nobody has
 * marked.
 *
 * ── The learner rows are the point, and they are sorted by concern ─────────
 *
 * A percentage for the whole class is a number somebody glances at. The reason
 * they opened the sheet is to find who is missing lessons — so the roll is
 * ordered by attendance ascending, worst first, which is the order the
 * conversation actually happens in.
 *
 * ── Percentages come from the server ───────────────────────────────────────
 *
 * `attendance_percentage` is computed there, over `counts_as_present` — which
 * counts late and left-early as present. A screen dividing present by total
 * would disagree with the figure on a report card, and the parent holding both
 * would be right to ask which one is wrong.
 */
/**
 * A page of an array, described the way a paginated endpoint would describe it.
 *
 * ── Why this one pages in the browser ──────────────────────────────────────
 *
 * `GET .../attendance` is a REPORT, not a listing: it answers with the totals
 * and both breakdowns in one object, because the percentages are computed
 * across the whole window and a page of them would be a page of a sum. So the
 * data is already in hand, and slicing it here costs a request nobody would
 * otherwise make.
 *
 * That is the opposite call from the roll and the subjects, which are real
 * paginated endpoints and are paged by the server. Saying which is which
 * matters: a client-side pager over a listing would quietly cap the data at
 * whatever the first response happened to contain.
 */
function paginate<T>(rows: T[], page: number, perPage: number) {
  const total = rows.length
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const current = Math.min(Math.max(1, page), lastPage)
  const start = (current - 1) * perPage
  const slice = rows.slice(start, start + perPage)

  return {
    slice,
    meta: {
      current_page: current,
      per_page: perPage,
      total,
      last_page: lastPage,
      from: total === 0 ? null : start + 1,
      to: total === 0 ? null : start + slice.length,
      has_more: current < lastPage,
      next_page_url: null,
      previous_page_url: null,
    },
  }
}

export function ClassAttendance({ groupId }: { groupId: string }) {
  const t = useTerminology()

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [learnerPage, setLearnerPage] = useState(1)
  const [dayPage, setDayPage] = useState(1)
  /*
   * The sheet first.
   *
   * It answers both questions a register is opened for — who is missing
   * lessons, and what happened on a given day — by being looked at. The two
   * lists underneath answer one each, and are kept for the times somebody
   * wants them ranked rather than laid out.
   */
  const [view, setView] = useState<'sheet' | 'lists'>('sheet')

  const query = useMemo(() => ({ from, to }), [from, to])

  const report = useQuery({
    queryKey: classroomKeys.attendance(groupId, query),
    queryFn: () => classroomApi.attendance(groupId, query),
  })

  if (report.isError) {
    return (
      <Card>
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      </Card>
    )
  }

  if (report.isLoading || !report.data) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </Card>
    )
  }

  const data = report.data
  const { totals } = data

  /* Worst first — see the file note. Sorted before slicing, so page one is
   * the ten who need looking at rather than ten arbitrary names. */
  const learners = data.by_learner
    .slice()
    .sort((a, b) => a.counts.attendance_percentage - b.counts.attendance_percentage)

  const learnerPageData = paginate(learners, learnerPage, CLASS_PAGE_SIZE)
  const dayPageData = paginate(data.by_day, dayPage, CLASS_PAGE_SIZE)

  return (
    <div className="flex flex-col gap-4">
      {/* A window, stated as one control rather than two loose date boxes —
        * Sprig labels its range "Received within" and keeps it on the canvas. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="From">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.currentTarget.value)
                  setLearnerPage(1)
                  setDayPage(1)
                }}
              />
            )}
          </Field>
        </div>
        <div className="w-40">
          <Field label="To">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.currentTarget.value)
                  setLearnerPage(1)
                  setDayPage(1)
                }}
              />
            )}
          </Field>
        </div>
        <p className="pb-5 text-2xs text-gray-500">
          {formatDate(data.range.from)} to {formatDate(data.range.to)}
        </p>

        <div className="ml-auto pb-5">
          <Segmented
            label="How to show attendance"
            value={view}
            onChange={(value) => setView(value as 'sheet' | 'lists')}
            options={[
              { value: 'sheet', label: 'Sheet' },
              { value: 'lists', label: 'Summary' },
            ]}
          />
        </div>
      </div>

      {!data.ever_taken ? (
        <Card>
          <EmptyState
            icon={<ClipboardText size={20} />}
            title="No register has been taken"
            description={`Nothing has been marked for this ${t('group').toLowerCase()} in this window. That is not the same as everybody being present — take a register from the ${t('group').toLowerCase()} roll and the figures start here.`}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile
              label="Attendance"
              value={formatPercent(totals.attendance_percentage / 100)}
              hint={`${formatNumber(totals.registers_taken ?? 0)} register(s) taken`}
            />
            <StatTile label="Present" value={formatNumber(totals.present_count)} />
            <StatTile
              label="Absent"
              value={formatNumber(totals.absent_count)}
              hint={totals.excused_count > 0 ? `${formatNumber(totals.excused_count)} excused` : undefined}
            />
            <StatTile
              label="Late"
              value={formatNumber(totals.late_count)}
              hint={
                totals.left_early_count > 0
                  ? `${formatNumber(totals.left_early_count)} left early`
                  : undefined
              }
            />
          </div>

          {view === 'sheet' ? (
            <AttendanceSheet
              days={data.by_day}
              learners={learners}
              pageSize={CLASS_PAGE_SIZE}
            />
          ) : (
            <>
              <Card>
                <CardHeader
                  title={`By ${t('learner').toLowerCase()}`}
                  subtitle="Lowest attendance first — the order the conversation happens in"
                />

                {learners.length === 0 ? (
                  <EmptyState title="Nobody was marked in this window" />
                ) : (
                  <>
                    <ul className="divide-y divide-gray-200">
                      {learnerPageData.slice.map((learner) => (
                        <LearnerRow key={learner.student_id} learner={learner} />
                      ))}
                    </ul>
                    {learnerPageData.meta.total > CLASS_PAGE_SIZE && (
                      <Pagination
                        className="px-4"
                        pagination={learnerPageData.meta}
                        onPageChange={setLearnerPage}
                      />
                    )}
                  </>
                )}
              </Card>

              <Card>
                <CardHeader title="By day" subtitle="Each register taken in this window" />
                {data.by_day.length === 0 ? (
                  <EmptyState icon={<CalendarBlank size={20} />} title="No registers in this window" />
                ) : (
                  <>
                    <ul className="divide-y divide-gray-200">
                      {dayPageData.slice.map((day) => (
                        <li
                          key={day.session_id}
                          className="flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50"
                        >
                          <span className="min-w-0 flex-1 text-sm text-gray-900">
                            {formatDate(day.session_date)}
                          </span>
                          <span className="text-2xs text-gray-600">
                            {formatNumber(day.counts.present_count)} present ·{' '}
                            {formatNumber(day.counts.absent_count)} absent
                          </span>
                          <span className="w-16 shrink-0 text-right text-sm text-gray-900 tabular">
                            {formatPercent(day.counts.attendance_percentage / 100)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {dayPageData.meta.total > CLASS_PAGE_SIZE && (
                      <Pagination
                        className="px-4"
                        pagination={dayPageData.meta}
                        onPageChange={setDayPage}
                      />
                    )}
                  </>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}

function LearnerRow({ learner }: { learner: AttendanceByLearner }) {
  const percent = learner.counts.attendance_percentage
  /* Thresholds a head of year would recognise, not arbitrary colour bands. */
  const concerning = percent < 90
  const serious = percent < 85

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-gray-900">{learner.name}</span>
        <span className="block truncate text-2xs text-gray-500">{learner.student_number}</span>
      </span>

      <span className="text-2xs text-gray-600">
        {formatNumber(learner.counts.absent_count)} absent
        {learner.counts.late_count > 0 && ` · ${formatNumber(learner.counts.late_count)} late`}
      </span>

      {/* A bar, because comparing thirty percentages as digits is a job a
        * length does in one glance. */}
      <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-gray-100 sm:block">
        <span
          className={cn(
            'block h-full rounded-full',
            serious ? 'bg-danger-500' : concerning ? 'bg-brand-400' : 'bg-success-500',
          )}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </span>

      <span
        className={cn(
          'w-14 shrink-0 text-right text-sm tabular',
          serious ? 'font-semibold text-danger-600' : 'text-gray-900',
        )}
      >
        {formatPercent(percent / 100)}
      </span>

      {serious && (
        <Warning size={14} weight="fill" className="shrink-0 text-danger-500" aria-label="Below 85%" />
      )}
    </li>
  )
}
