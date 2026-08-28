import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Avatar,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  MetaDot,
  PageHeader,
  Skeleton,
  StatTile,
  StatusBadge,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { cn } from '@/shared/lib/cn'
import { qk } from '@/shared/api/queryKeys'
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/shared/lib/format'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { dashboardApi, dashboardKeys } from './dashboard.api'
import { sessionWideAttendance } from './dashboard.types'
import type { PortalAttendance, PortalBalance, PortalRecord } from './dashboard.types'
import {
  CalendarMeta,
  Figure,
  ModuleLink,
  PanelLink,
  PanelState,
  QuickLinks,
  RowsSkeleton,
  TileRow,
  tileFigure,
  useGreetingTitle,
} from './widgets'

/**
 * A parent's children, side by side.
 *
 * `access.scopes.child_student_ids` says how many there are and
 * `/portal/my-record` returns one record per child, so the card count comes
 * from the data rather than from a guess. The per-child endpoints — balance
 * and attendance — take `?student_id=`, which the API intersects with those
 * authorized ids: naming a stranger's child returns nothing rather than
 * refusing, so there is no id here that could reach another family's record.
 *
 * Without a `student_id` the balance endpoint answers 404 rather than picking
 * a child, which is why every fan-out below names one explicitly instead of
 * relying on a default.
 */
export function GuardianDashboard() {
  const { access, tenant } = useTenant()
  const perms = usePermissions()
  const t = useTerminology()
  const title = useGreetingTitle()

  const canSeeFinance = perms.has('finance.view')
  const canSeeAttendance = perms.has('attendance.view')

  const records = useQuery({
    queryKey: qk.portal.myRecord(),
    queryFn: dashboardApi.myRecord,
  })

  const children = records.data ?? []

  const balances = useQueries({
    queries: children.map((child) => ({
      queryKey: dashboardKeys.childBalance(child.student_id),
      queryFn: () => dashboardApi.balance(child.student_id),
      enabled: canSeeFinance,
    })),
  })

  const attendances = useQueries({
    queries: children.map((child) => ({
      queryKey: dashboardKeys.childAttendance(child.student_id),
      queryFn: () => dashboardApi.attendance(child.student_id),
      enabled: canSeeAttendance,
    })),
  })

  const announcements = useQuery({
    queryKey: qk.portal.announcements(),
    queryFn: dashboardApi.announcements,
  })

  /**
   * A combined line may only be drawn once EVERY child's balance is in.
   *
   * Summing the ones that answered would put a smaller, wrong total in front
   * of a parent who has no way to tell a child is missing from it — and "you
   * owe less than you do" is the one rounding error nobody forgives. A single
   * failure collapses the tile to a dash and says why.
   */
  const balancesPending = balances.some((query) => query.isPending)
  const balancesFailed = balances.some((query) => query.isError)
  const balancesComplete =
    canSeeFinance && children.length > 0 && !balancesPending && !balancesFailed

  const outstandingMinor = balances.reduce(
    (sum, query) => sum + (query.data?.balance_minor ?? 0),
    0,
  )
  const invoiceCount = balances.reduce((sum, query) => sum + (query.data?.invoice_count ?? 0), 0)
  const currency = balances.find((query) => query.data)?.data?.currency ?? tenant.default_currency
  const owingCount = balances.filter((query) => query.data?.is_settled === false).length

  if (records.isError) {
    return (
      <PageStack>
        <PageHeader title={title} />
        <Card>
          <CardBody>
            <ErrorState error={records.error} onRetry={() => records.refetch()} />
          </CardBody>
        </Card>
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader title={title} meta={<CalendarMeta />} />

      <TileRow>
        <StatTile
          label={`${t('learners')} in your care`}
          value={formatNumber(children.length)}
          hint={children.length === 1 ? undefined : 'records linked to you'}
          loading={records.isPending}
        />

        {canSeeFinance && (
          <>
            <StatTile
              label="Outstanding across all"
              value={balancesComplete ? formatMoney(outstandingMinor, currency) : '—'}
              hint={
                balancesFailed
                  ? 'a balance could not be loaded'
                  : balancesComplete
                    ? owingCount === 0
                      ? 'everything settled'
                      : `${formatNumber(owingCount)} of ${formatNumber(children.length)} owing`
                    : undefined
              }
              loading={records.isPending || balancesPending}
            />
            <StatTile
              label="Invoices"
              {...tileFigure({
                isError: balancesFailed,
                value: balancesComplete ? formatNumber(invoiceCount) : '—',
                hint: `raised this ${t('session').toLowerCase()}`,
              })}
              loading={records.isPending || balancesPending}
            />
          </>
        )}
      </TileRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {records.isPending && (
          <>
            <Card>
              <CardBody>
                <RowsSkeleton rows={4} />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <RowsSkeleton rows={4} />
              </CardBody>
            </Card>
          </>
        )}

        {!records.isPending && children.length === 0 && (
          <Card className="lg:col-span-2">
            <CardBody>
              <EmptyState
                className="py-8"
                title={`No ${t('learners').toLowerCase()} linked to you`}
                description="The school links a child's record to a guardian account. Ask the office if one is missing."
              />
            </CardBody>
          </Card>
        )}

        {children.map((child, index) => (
          <ChildCard
            key={child.student_id}
            child={child}
            balance={canSeeFinance ? balances[index]?.data : undefined}
            balanceError={canSeeFinance ? balances[index]?.error : undefined}
            balancePending={canSeeFinance ? (balances[index]?.isPending ?? false) : false}
            attendance={
              canSeeAttendance ? sessionWideAttendance(attendances[index]?.data) : null
            }
            attendanceError={canSeeAttendance ? attendances[index]?.error : undefined}
            attendancePending={canSeeAttendance ? (attendances[index]?.isPending ?? false) : false}
            showFees={canSeeFinance}
            showAttendance={canSeeAttendance}
            levelNoun={t('level')}
            groupNoun={t('group')}
          />
        ))}
      </div>

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

/**
 * One child, whole.
 *
 * Standing, attendance and fees together rather than split across three
 * panels: a parent's question is about a person, and answering it in three
 * places makes them assemble the answer themselves.
 */
function ChildCard({
  child,
  balance,
  balanceError,
  balancePending,
  attendance,
  attendanceError,
  attendancePending,
  showFees,
  showAttendance,
  levelNoun,
  groupNoun,
}: {
  child: PortalRecord
  balance: PortalBalance | undefined
  balanceError: unknown
  balancePending: boolean
  attendance: PortalAttendance | null
  attendanceError: unknown
  attendancePending: boolean
  /** A guardian profile without `finance.view` gets no fee column at all,
   *  rather than a column of dashes explaining nothing. */
  showFees: boolean
  showAttendance: boolean
  levelNoun: string
  groupNoun: string
}) {
  const group = child.learning_groups[0]
  const columns = (showAttendance ? 1 : 0) + (showFees ? 1 : 0)

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Avatar name={child.person.full_name} size="sm" />
            {child.person.preferred_name ?? child.person.full_name}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5">
            {child.student_number && <span className="tabular">{child.student_number}</span>}
            {child.level && (
              <>
                <MetaDot />
                <span>
                  {levelNoun} {child.level.name}
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
            {child.program && (
              <>
                <MetaDot />
                <span>{child.program.name}</span>
              </>
            )}
          </span>
        }
        actions={<StatusBadge status={child.status} />}
      />

      <CardBody className="flex-1 space-y-4">
        {columns > 0 && (
          <div className={cn('grid gap-4', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
            {showAttendance && (
              <div>
                <p className="text-xs text-gray-600">Attendance</p>
                {attendancePending ? (
                  <Skeleton className="mt-1.5 h-5 w-16" />
                ) : (
                  <p className="mt-0.5 text-lg font-semibold text-gray-900 tabular">
                    {attendance ? formatPercent(attendance.attendance_percentage / 100, 0) : '—'}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-gray-600">
                  {attendanceError
                    ? 'could not be loaded'
                    : attendance
                      ? `${formatNumber(attendance.present_count)} of ${formatNumber(attendance.sessions_total)} sessions`
                      : 'not computed yet'}
                </p>
              </div>
            )}

            {showFees && (
              <div>
                <p className="text-xs text-gray-600">Fees</p>
                {balancePending ? (
                  <Skeleton className="mt-1.5 h-5 w-24" />
                ) : (
                  <p className="mt-0.5 text-lg font-semibold text-gray-900 tabular">
                    {balance ? formatMoney(balance.balance_minor, balance.currency) : '—'}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-gray-600">
                  {balance
                    ? balance.is_settled
                      ? 'settled in full'
                      : 'outstanding'
                    : 'could not be loaded'}
                </p>
              </div>
            )}
          </div>
        )}

        {balanceError ? (
          <ErrorState error={balanceError} />
        ) : (
          balance && (
            <div className="divide-y divide-gray-200 border-t border-gray-200">
              <Figure label="Invoiced" value={formatMoney(balance.invoiced_minor, balance.currency)} />
              <Figure label="Paid" value={formatMoney(balance.paid_minor, balance.currency)} />
              {balance.overdue_minor > 0 && (
                <Figure
                  label="Overdue"
                  value={formatMoney(balance.overdue_minor, balance.currency)}
                  emphasis
                />
              )}
            </div>
          )
        )}

      </CardBody>

      <div className="flex items-center gap-4 border-t border-gray-200 px-4 py-2.5">
        <ModuleLink
          route="attendance"
          className="text-xs font-medium text-accent-500 hover:text-accent-600 hover:underline"
        >
          Attendance
        </ModuleLink>
        <ModuleLink
          route="results"
          className="text-xs font-medium text-accent-500 hover:text-accent-600 hover:underline"
        >
          Results
        </ModuleLink>
        <ModuleLink
          route="finance"
          className="text-xs font-medium text-accent-500 hover:text-accent-600 hover:underline"
        >
          Fees
        </ModuleLink>
      </div>
    </Card>
  )
}
