import { useId, useMemo, useState } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  GraduationCap,
  Receipt,
  Student as StudentIcon,
  UsersThree,
} from '@phosphor-icons/react'
import { qk } from '@/shared/api/queryKeys'
import { formatDate } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import {
  usePermissions,
  useModules,
  useTenant,
  useTerminology,
} from '@/features/tenant/TenantProvider'
import {
  EntityIcon,
  ErrorState,
  MetaDot,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  panelId,
  type TabItem,
} from '@/shared/ui'
import { PortalStudentDetailPage } from './PortalStudentsPage'
import { studentsApi } from './students.api'
import {
  StudentAcademic,
  StudentFinance,
  StudentGuardians,
  StudentOverview,
  StudentRecordSkeleton,
} from './StudentPanels'
import { readStudentListSearch, toStudentListQuery } from './useStudentListSearch'

/**
 * One student's record, which is two screens for the same reason `/students`
 * is: `GET /admin/students/{id}` needs a staff PROFILE, and refuses a learner
 * asking after themselves and a guardian asking after their own child — 403,
 * not 404. Neither holds a permission that says so, so the branch is on the
 * portal. The route is reachable for both: `/search` returns student hits to
 * them and links straight here, and a notification with a `student_profile`
 * context does the same.
 */
export function StudentDetailPage() {
  const { studentId } = useParams({ from: '/app/students/$studentId' })
  const { portal } = useTenant()

  if (portal === 'student' || portal === 'guardian') {
    return <PortalStudentDetailPage studentId={studentId} />
  }

  return <StaffStudentDetailPage studentId={studentId} />
}

/**
 * One student's whole standing.
 *
 * ── A tab is only drawn when its data can actually be fetched ──────────────
 *
 * Each tab past Overview is a different endpoint behind a different permission
 * and a different module: placement history is `GET /admin/enrollments` behind
 * `enrollment.view`, guardians are `GET /admin/students/{id}/guardians` behind
 * `guardians.view`, money is `GET /admin/finance/students/{id}/balance` behind
 * `finance.view`. A tab that is drawn and then answers 403 is a worse
 * experience than one that was never there, so the ones this reader cannot
 * load are not offered at all.
 *
 * Guardians are additionally gated on the institution PROFILE rather than a
 * permission: `supports_guardians` is false for institutions whose learners
 * are adults, and there is no guardian to show for them — not a refusal, an
 * absence.
 */
function StaffStudentDetailPage({ studentId }: { studentId: string }) {
  const t = useTerminology()
  const perms = usePermissions()
  const modules = useModules()
  const { access } = useTenant()
  const tabsId = useId()

  /* The list's filters travel in this route's own query string, so the way
   * back lands on the page of the roll the reader came from — after a reload
   * or from a pasted link, not only from history. */
  const rawSearch = useSearch({ strict: false })
  const listSearch = useMemo(() => readStudentListSearch(rawSearch), [rawSearch])

  const record = useQuery({
    queryKey: qk.students.detail(studentId),
    queryFn: () => studentsApi.detail(studentId),
  })

  const tabs: TabItem[] = [
    { key: 'overview', label: 'Overview', icon: <StudentIcon size={14} /> },
  ]

  if (modules.has('enrollment') && perms.has('enrollment.view')) {
    tabs.push({ key: 'academic', label: 'Academic', icon: <GraduationCap size={14} /> })
  }
  if (
    modules.has('guardians') &&
    perms.has('guardians.view') &&
    access?.institution.supports_guardians !== false
  ) {
    tabs.push({ key: 'guardians', label: t('guardians'), icon: <UsersThree size={14} /> })
  }
  if (modules.has('finance') && perms.has('finance.view')) {
    tabs.push({ key: 'finance', label: 'Finance', icon: <Receipt size={14} /> })
  }

  const [tab, setTab] = useState('overview')
  const active = tabs.some((item) => item.key === tab) ? tab : 'overview'

  const backLink = (
    <Link
      to="/students"
      search={toStudentListQuery(listSearch)}
      className="inline-flex items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={12} weight="bold" />
      All {t('learners').toLowerCase()}
    </Link>
  )

  if (record.isError) {
    return (
      <PageStack>
        {backLink}
        <ErrorState error={record.error} onRetry={() => record.refetch()} />
      </PageStack>
    )
  }

  const data = record.data

  return (
    <PageStack>
      {backLink}

      <PageHeader
        icon={
          <EntityIcon tone="accent">
            <StudentIcon size={18} />
          </EntityIcon>
        }
        title={data ? data.person.full_name : <Skeleton className="h-5 w-48" />}
        meta={
          data ? (
            <>
              <span className="tabular">{data.student_number}</span>
              <MetaDot />
              <span>
                {data.learning_groups.length > 0
                  ? data.learning_groups.map((group) => group.name).join(', ')
                  : `No ${t('group').toLowerCase()}`}
              </span>
              <MetaDot />
              <StatusBadge status={data.status} />
              {data.admission_date && (
                <>
                  <MetaDot />
                  <span>Admitted {formatDate(data.admission_date)}</span>
                </>
              )}
            </>
          ) : (
            <Skeleton className="h-3 w-64" />
          )
        }
      />

      <div className="flex flex-col gap-4">
        <Tabs items={tabs} value={active} onChange={setTab} baseId={tabsId} />

        <div
          role="tabpanel"
          id={panelId(tabsId, active)}
          aria-labelledby={`${tabsId}-tab-${active}`}
        >
          {!data && <StudentRecordSkeleton />}

          {data && active === 'overview' && <StudentOverview record={data} />}
          {data && active === 'academic' && <StudentAcademic studentId={data.student_id} />}
          {data && active === 'guardians' && <StudentGuardians studentId={data.student_id} />}
          {data && active === 'finance' && <StudentFinance studentId={data.student_id} />}
        </div>
      </div>
    </PageStack>
  )
}
