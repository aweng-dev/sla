import { useQuery } from '@tanstack/react-query'
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  StatusBadge,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { qk } from '@/shared/api/queryKeys'
import { formatDate, formatNumber, humanize } from '@/shared/lib/format'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { dashboardApi, dashboardKeys } from './dashboard.api'
import type { CourseOfferingRow, GradebookRow } from './dashboard.types'
import {
  CalendarMeta,
  ModuleLink,
  PanelLink,
  PanelRow,
  PanelState,
  TileRow,
  tileFigure,
  TimetableToday,
  useGreetingTitle,
  useInstitutionToday,
} from './widgets'

/**
 * A teacher's day, not the institution's.
 *
 * Their authority is held at the offering — one course, one class, one term —
 * and `access.scopes.by_type` names exactly which. So this screen is built
 * around what they teach rather than around institution-wide totals: the
 * `/admin/students` listing answers for them, but it answers with all hundred
 * learners in the school, and a tile reading "100" on a form tutor's dashboard
 * is a number they have no use for and would misread as their own roll.
 *
 * The offerings are fetched with `?staff_id=` for the same reason — the reader
 * scope alone would hand a form tutor every offering on their campus.
 */
export function TeacherDashboard() {
  const { membership } = useTenant()
  const perms = usePermissions()
  const t = useTerminology()
  const title = useGreetingTitle()
  const today = useInstitutionToday()

  const staffId = membership?.staff_id ?? null

  const canSeeOfferings = perms.has('course_offerings.view') && staffId !== null
  const canSeeGradebooks = perms.has('gradebook.view')
  const canReviewAttendance = perms.has('attendance.manage')
  const canSeeTimetable = perms.has('timetable.view')

  const offerings = useQuery({
    queryKey: dashboardKeys.offeringsForStaff(staffId ?? ''),
    queryFn: () => dashboardApi.offeringsForStaff(staffId as string),
    enabled: canSeeOfferings,
  })

  const gradebooks = useQuery({
    queryKey: dashboardKeys.gradebooks(),
    queryFn: dashboardApi.gradebooks,
    enabled: canSeeGradebooks,
  })

  /* Only the ones waiting on this teacher. A reviewed excuse is a record, not
   * a task, and belongs on the attendance screen rather than on a dashboard. */
  const excuses = useQuery({
    queryKey: dashboardKeys.excuses('pending'),
    queryFn: () => dashboardApi.excuses('pending'),
    enabled: canReviewAttendance,
  })

  const timetable = useQuery({
    queryKey: qk.portal.timetable({ on: today }),
    queryFn: () => dashboardApi.timetable(today),
    enabled: canSeeTimetable,
  })

  const offeringRows = offerings.data?.rows ?? []
  const groupCount = new Set(
    offeringRows.map((row) => row.learning_group_id).filter((id): id is string => id !== null),
  ).size
  const registered = offeringRows.reduce((sum, row) => sum + row.registered_count, 0)
  const openGradebooks = (gradebooks.data?.rows ?? []).filter((row) => !row.is_locked).length

  return (
    <PageStack>
      <PageHeader title={title} meta={<CalendarMeta />} />

      <TileRow>
        {canSeeOfferings && (
          <>
            <StatTile
              label={`${t('courses')} you teach`}
              {...tileFigure({
                isError: offerings.isError,
                value: formatNumber(offeringRows.length),
                hint: offerings.data
                  ? `across ${formatNumber(groupCount)} ${plural(groupCount, t('group'), t('groups')).toLowerCase()}`
                  : undefined,
              })}
              loading={offerings.isPending}
            />
            <StatTile
              label={`${t('learners')} registered`}
              {...tileFigure({
                isError: offerings.isError,
                value: formatNumber(registered),
                hint: 'across every offering',
              })}
              loading={offerings.isPending}
            />
          </>
        )}

        {canSeeGradebooks && (
          <StatTile
            label="Open gradebooks"
            {...tileFigure({
              isError: gradebooks.isError,
              value: formatNumber(openGradebooks),
              hint: gradebooks.data
                ? `of ${formatNumber(gradebooks.data.rows.length)} in total`
                : undefined,
            })}
            loading={gradebooks.isPending}
          />
        )}

        {canReviewAttendance && (
          <StatTile
            label="Excuses to review"
            {...tileFigure({
              isError: excuses.isError,
              value: formatNumber(excuses.data?.length),
              hint:
                excuses.data && excuses.data.length === 0
                  ? 'nothing waiting on you'
                  : 'awaiting a decision',
            })}
            loading={excuses.isPending}
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
            emptyDescription="No timetable has been published for you yet. Your lessons will appear here once one is."
          />
        )}

        {canSeeOfferings && (
          <Card className="flex h-full flex-col">
            <CardHeader
              title={`Your ${t('courses').toLowerCase()}`}
              subtitle={offeringRows[0]?.academic_period_name ?? undefined}
              actions={<PanelLink route="course-offerings" label="All offerings" />}
            />
            <CardBody className="flex-1">
              <PanelState
                isPending={offerings.isPending}
                error={offerings.error}
                isEmpty={offeringRows.length === 0}
                onRetry={() => offerings.refetch()}
                empty={
                  <EmptyState
                    className="py-8"
                    title={`No ${t('courses').toLowerCase()} assigned`}
                    description={`You are not listed as an instructor on any offering this ${t('period').toLowerCase()}.`}
                  />
                }
              >
                <ul className="divide-y divide-gray-200">
                  {offeringRows.map((row) => (
                    <OfferingRow key={row.id} row={row} groupNoun={t('group')} />
                  ))}
                </ul>
              </PanelState>
            </CardBody>
          </Card>
        )}
      </PanelRow>

      <PanelRow>
        {canSeeGradebooks && (
          <Card className="flex h-full flex-col">
            <CardHeader
              title="Gradebooks"
              subtitle="Marks you are responsible for"
              actions={<PanelLink route="gradebook" label="Gradebook" />}
            />
            <CardBody className="flex-1">
              <PanelState
                isPending={gradebooks.isPending}
                error={gradebooks.error}
                isEmpty={(gradebooks.data?.rows.length ?? 0) === 0}
                onRetry={() => gradebooks.refetch()}
                empty={
                  <EmptyState
                    className="py-8"
                    title="No gradebooks yet"
                    description="A gradebook is created with the first assessment on an offering."
                  />
                }
              >
                <ul className="divide-y divide-gray-200">
                  {(gradebooks.data?.rows ?? []).map((row) => (
                    <GradebookListRow key={row.id} row={row} />
                  ))}
                </ul>
              </PanelState>
            </CardBody>
          </Card>
        )}

        {canReviewAttendance && (
          <Card className="flex h-full flex-col">
            <CardHeader
              title="Absence excuses"
              subtitle="Waiting on your decision"
              actions={<PanelLink route="attendance" label={t('register')} />}
            />
            <CardBody className="flex-1">
              <PanelState
                isPending={excuses.isPending}
                error={excuses.error}
                isEmpty={(excuses.data?.length ?? 0) === 0}
                onRetry={() => excuses.refetch()}
                empty={
                  <EmptyState
                    className="py-8"
                    title="Nothing waiting"
                    description="Every excuse submitted for your classes has been reviewed."
                  />
                }
              >
                <ul className="divide-y divide-gray-200">
                  {(excuses.data ?? []).map((excuse) => (
                    <li key={excuse.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-900">
                          {excuse.student?.name ?? excuse.student?.student_number ?? 'Unnamed'}
                        </p>
                        <p className="truncate text-xs text-gray-600">
                          {excuse.reason ?? humanize(excuse.category)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-gray-600">
                        <span className="tabular">
                          {excuse.starts_on === excuse.ends_on
                            ? formatDate(excuse.starts_on)
                            : `${formatDate(excuse.starts_on)} – ${formatDate(excuse.ends_on)}`}
                        </span>
                        <StatusBadge status={excuse.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </PanelState>
            </CardBody>
          </Card>
        )}
      </PanelRow>

    </PageStack>
  )
}

function OfferingRow({ row, groupNoun }: { row: CourseOfferingRow; groupNoun: string }) {
  const capacity = row.capacity

  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <ModuleLink
        route="course-offerings"
        className="flex items-center gap-3 rounded-md px-1 py-1 -mx-1 transition-colors hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-900">{row.course_title ?? row.code}</p>
          <p className="truncate text-xs text-gray-600">
            {[row.learning_group_name ? `${groupNoun} ${row.learning_group_name}` : null, row.code]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <p className="shrink-0 text-xs text-gray-600">
          <span className="tabular">
            {formatNumber(row.registered_count)}
            {capacity !== null && `/${formatNumber(capacity)}`}
          </span>{' '}
          registered
        </p>
      </ModuleLink>
    </li>
  )
}

function GradebookListRow({ row }: { row: GradebookRow }) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <ModuleLink
        route="gradebook"
        className="flex items-center gap-3 rounded-md px-1 py-1 -mx-1 transition-colors hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-900">{row.course_title ?? row.course_offering_code}</p>
          <p className="truncate text-xs text-gray-600">
            {[
              row.learning_group_name,
              row.academic_period_name,
              `${formatNumber(row.assessments_count)} ${row.assessments_count === 1 ? 'assessment' : 'assessments'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {/* "Published" is the fact a teacher is actually checking for — a
            gradebook can be open and complete and still invisible to the
            class, which is the state that generates the emails. */}
        <div className="shrink-0">
          <StatusBadge status={row.is_published ? 'published' : row.status} />
        </div>
      </ModuleLink>
    </li>
  )
}

/** English plural for a count, so a tile does not read "1 classes". */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}
