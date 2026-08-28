import { useQuery } from '@tanstack/react-query'
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  MetaDot,
  PageHeader,
  StatTile,
  StatusBadge,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { cn } from '@/shared/lib/cn'
import { qk } from '@/shared/api/queryKeys'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from '@/shared/lib/format'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { dashboardApi } from './dashboard.api'
import { sessionWideAttendance } from './dashboard.types'
import type { PortalBalance, PortalRecord } from './dashboard.types'
import {
  CalendarMeta,
  Figure,
  InlineSkeleton,
  PanelLink,
  PanelRow,
  PanelState,
  QuickLinks,
  RowsSkeleton,
  TileRow,
  tileFigure,
  TimetableToday,
  useGreetingTitle,
  useInstitutionToday,
} from './widgets'

/**
 * One learner's own record.
 *
 * `/portal/my-record` is an array for everybody — a guardian has several
 * children — so a learner's single record is its first element and not a
 * different endpoint. Reading it as an object is the mistake this shape exists
 * to prevent.
 *
 * The seeded institution has settled fees, full attendance and nothing
 * published to results or assignments yet, which is the ordinary state of a
 * term in its first weeks. Those two panels say "nothing published yet" rather
 * than showing a spinner that never resolves or an error that is not one.
 */
export function StudentDashboard() {
  const { access } = useTenant()
  const perms = usePermissions()
  const t = useTerminology()
  const title = useGreetingTitle()
  const today = useInstitutionToday()

  const canSeeFinance = perms.has('finance.view')
  const canSeeResults = perms.has('results.view')
  const canSeeAssignments = perms.has('assignments.view')
  const canSeeAttendance = perms.has('attendance.view')
  const canSeeTimetable = perms.has('timetable.view')

  const record = useQuery({
    queryKey: qk.portal.myRecord(),
    queryFn: dashboardApi.myRecord,
  })

  const balance = useQuery({
    queryKey: qk.portal.balance(),
    queryFn: () => dashboardApi.balance(),
    enabled: canSeeFinance,
  })

  const attendance = useQuery({
    queryKey: qk.portal.attendance(),
    queryFn: () => dashboardApi.attendance(),
    enabled: canSeeAttendance,
  })

  const timetable = useQuery({
    queryKey: qk.portal.timetable({ on: today }),
    queryFn: () => dashboardApi.timetable(today),
    enabled: canSeeTimetable,
  })

  const results = useQuery({
    queryKey: qk.portal.results(),
    queryFn: dashboardApi.results,
    enabled: canSeeResults,
  })

  const assignments = useQuery({
    queryKey: qk.portal.assignments({ per_page: 5 }),
    queryFn: dashboardApi.assignments,
    enabled: canSeeAssignments,
  })

  const announcements = useQuery({
    queryKey: qk.portal.announcements(),
    queryFn: dashboardApi.announcements,
  })

  const me: PortalRecord | undefined = record.data?.[0]
  const rollup = sessionWideAttendance(attendance.data)

  if (record.isError) {
    return (
      <PageStack>
        <PageHeader title={title} />
        <Card>
          <CardBody>
            <ErrorState error={record.error} onRetry={() => record.refetch()} />
          </CardBody>
        </Card>
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader
        title={title}
        meta={
          record.isPending ? (
            <InlineSkeleton className="h-3 w-64" />
          ) : (
            <RecordMeta record={me} levelNoun={t('level')} groupNoun={t('group')} />
          )
        }
      />

      <TileRow>
        {canSeeAttendance && (
          <StatTile
            label="Attendance"
            {...tileFigure({
              isError: attendance.isError,
              value: rollup ? formatPercent(rollup.attendance_percentage / 100, 0) : '—',
              hint: rollup
                ? `${formatNumber(rollup.present_count)} of ${formatNumber(rollup.sessions_total)} sessions`
                : 'not computed yet',
            })}
            loading={attendance.isPending}
          />
        )}

        {canSeeFinance && (
          <StatTile
            label="Fees outstanding"
            {...tileFigure({
              isError: balance.isError,
              value: balance.data
                ? formatMoney(balance.data.balance_minor, balance.data.currency)
                : '—',
              hint: balance.data ? (balance.data.is_settled ? 'settled in full' : 'due') : undefined,
            })}
            loading={balance.isPending}
          />
        )}

        {canSeeResults && (
          <StatTile
            label={`${t('assessments')} published`}
            {...tileFigure({
              isError: results.isError,
              value: formatNumber(results.data?.length),
              hint: results.data?.length === 0 ? 'nothing published yet' : undefined,
            })}
            loading={results.isPending}
          />
        )}

        {canSeeAssignments && (
          <StatTile
            label="Assignments open"
            {...tileFigure({
              isError: assignments.isError,
              value: formatNumber(assignments.data?.pagination.total),
              hint: assignments.data?.pagination.total === 0 ? 'nothing set yet' : 'to hand in',
            })}
            loading={assignments.isPending}
          />
        )}
      </TileRow>

      <PanelRow>
        {canSeeTimetable && (
          <TimetableToday
            view={timetable.data}
            dateLabel={formatDate(today)}
            isPending={timetable.isPending}
            error={timetable.error}
            onRetry={() => timetable.refetch()}
            emptyDescription={`No timetable has been published for your ${t('group').toLowerCase()} yet.`}
          />
        )}

        {canSeeFinance && (
          <Card className="flex h-full flex-col">
            <CardHeader
              title="Fees"
              subtitle={balance.data ? `${formatNumber(balance.data.invoice_count)} invoice${balance.data.invoice_count === 1 ? '' : 's'}` : undefined}
              actions={<PanelLink route="finance" label="Statement" />}
            />
            <CardBody className="flex-1">
              <PanelState
                isPending={balance.isPending}
                error={balance.error}
                isEmpty={balance.data?.invoice_count === 0}
                onRetry={() => balance.refetch()}
                skeleton={<RowsSkeleton rows={4} />}
                empty={
                  <EmptyState
                    className="py-8"
                    title="Nothing invoiced"
                    description="No fees have been raised against your record."
                  />
                }
              >
                {balance.data && <BalanceBreakdown balance={balance.data} />}
              </PanelState>
            </CardBody>
          </Card>
        )}
      </PanelRow>

      <PanelRow>
        {canSeeResults && (
          <Card className="flex h-full flex-col">
            <CardHeader
              title={t('assessments')}
              actions={<PanelLink route="results" label="All results" />}
            />
            <CardBody className="flex-1">
              <PanelState
                isPending={results.isPending}
                error={results.error}
                isEmpty={(results.data?.length ?? 0) === 0}
                onRetry={() => results.refetch()}
                empty={
                  <EmptyState
                    className="py-8"
                    title="Nothing published yet"
                    /* Not "your {courses} results": the terminology word is
                       already plural, and the possessive reads as a typo. */
                    description={`Results for your ${t('courses').toLowerCase()} appear here once your teachers release them.`}
                  />
                }
              >
                <ul className="divide-y divide-gray-200">
                  {(results.data ?? []).map((result) => (
                    <li
                      key={result.id}
                      className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-900">
                          {result.course?.title ?? result.course?.code ?? t('course')}
                        </p>
                        <p className="truncate text-xs text-gray-600">
                          {result.published_at
                            ? `Released ${formatDate(result.published_at)}`
                            : 'Awaiting release'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-baseline gap-2 text-sm tabular">
                        {result.percentage !== null && (
                          <span className="text-gray-600">
                            {formatPercent(result.percentage / 100, 0)}
                          </span>
                        )}
                        {result.letter_grade && (
                          <span
                            className={cn(
                              'font-semibold',
                              result.is_passing === false ? 'text-danger-600' : 'text-gray-900',
                            )}
                          >
                            {result.letter_grade}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </PanelState>
            </CardBody>
          </Card>
        )}

        {canSeeAssignments && (
          <Card className="flex h-full flex-col">
            <CardHeader
              title="Assignments"
              actions={<PanelLink route="assignments" label="All assignments" />}
            />
            <CardBody className="flex-1">
              <PanelState
                isPending={assignments.isPending}
                error={assignments.error}
                isEmpty={(assignments.data?.rows.length ?? 0) === 0}
                onRetry={() => assignments.refetch()}
                empty={
                  <EmptyState
                    className="py-8"
                    title="Nothing set yet"
                    description="Work your teachers publish will appear here with its due date."
                  />
                }
              >
                <ul className="divide-y divide-gray-200">
                  {(assignments.data?.rows ?? []).map((assignment) => (
                    <li
                      key={assignment.id}
                      className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-900">{assignment.title}</p>
                        <p className="truncate text-xs text-gray-600">
                          {assignment.course_title ?? assignment.course_code ?? t('course')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-gray-600">
                        <span className="tabular">
                          {assignment.due_at ? formatDateTime(assignment.due_at) : 'No due date'}
                        </span>
                        <StatusBadge status={assignment.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </PanelState>
            </CardBody>
          </Card>
        )}
      </PanelRow>

      <Card>
        <CardHeader
          title="Notices"
          actions={<PanelLink route="communications" label="All notices" />}
        />
        <CardBody>
          <PanelState
            isPending={announcements.isPending}
            error={announcements.error}
            isEmpty={(announcements.data?.length ?? 0) === 0}
            onRetry={() => announcements.refetch()}
            skeleton={<RowsSkeleton rows={2} />}
            empty={
              <EmptyState
                className="py-8"
                title="No notices"
                description="Announcements from the school will appear here."
              />
            }
          >
            <ul className="divide-y divide-gray-200">
              {(announcements.data ?? []).slice(0, 4).map((announcement) => (
                <li key={announcement.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm text-gray-900">
                      {announcement.title}
                    </p>
                    <span className="shrink-0 text-xs text-gray-600 tabular">
                      {formatDate(announcement.published_at)}
                    </span>
                  </div>
                  {announcement.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{announcement.body}</p>
                  )}
                </li>
              ))}
            </ul>
          </PanelState>
        </CardBody>
      </Card>

      {access && <QuickLinks items={access.navigation.quick_actions} />}
    </PageStack>
  )
}

/** Who this record belongs to, in the institution's own words. */
function RecordMeta({
  record,
  levelNoun,
  groupNoun,
}: {
  record: PortalRecord | undefined
  levelNoun: string
  groupNoun: string
}) {
  if (!record) return <CalendarMeta />

  const group = record.learning_groups[0]

  return (
    <>
      {record.student_number && <span className="tabular">{record.student_number}</span>}
      {record.level && (
        <>
          <MetaDot />
          <span>
            {levelNoun} {record.level.name}
          </span>
        </>
      )}
      {group && (
        <>
          <MetaDot />
          <span>
            {groupNoun} {group.name}
          </span>
        </>
      )}
      {record.program && (
        <>
          <MetaDot />
          <span>{record.program.name}</span>
        </>
      )}
      <MetaDot />
      <StatusBadge status={record.status} />
    </>
  )
}

/**
 * The fee position, stated both ways round.
 *
 * A balance of zero is shown as "settled" and not hidden: a family that has
 * paid wants to see that the school agrees, and a panel that disappears once
 * the money is in reads as the record having been lost.
 */
function BalanceBreakdown({ balance }: { balance: PortalBalance }) {
  const currency = balance.currency

  return (
    <div className="divide-y divide-gray-200">
      <Figure label="Invoiced" value={formatMoney(balance.invoiced_minor, currency)} />
      {balance.discount_minor > 0 && (
        <Figure label="Discounted" value={formatMoney(balance.discount_minor, currency)} />
      )}
      <Figure label="Paid" value={formatMoney(balance.paid_minor, currency)} />
      {balance.overdue_minor > 0 && (
        <Figure label="Overdue" value={formatMoney(balance.overdue_minor, currency)} />
      )}
      <Figure
        label={balance.is_settled ? 'Settled' : 'Outstanding'}
        value={formatMoney(balance.balance_minor, currency)}
        emphasis
      />
    </div>
  )
}
