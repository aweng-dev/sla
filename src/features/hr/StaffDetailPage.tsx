import { useId, useMemo, useState } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Buildings,
  Certificate,
  IdentificationBadge,
  Receipt,
  Sun,
} from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { formatDate } from '@/shared/lib/format'
import { useModules, usePermissions, useTenant } from '@/features/tenant/TenantProvider'
import {
  EntityIcon,
  ErrorState,
  MetaDot,
  PageHeader,
  panelId,
  StatusBadge,
  Tabs,
  type TabItem,
} from '@/shared/ui'
import { QualificationDialog } from './HrDialogs'
import {
  StaffAssignments,
  StaffLeave,
  StaffOverview,
  StaffPayslips,
  StaffQualifications,
  StaffRecordSkeleton,
} from './StaffPanels'
import { hrKeys, staffApi } from './hr.api'
import { useStaffPhoto } from './useStaffPhoto'
import { readStaffListSearch, toStaffListQuery } from './useStaffListSearch'

/**
 * One member of staff.
 *
 * ── A tab is only drawn when its data can actually be fetched ──────────────
 *
 * Assignments come from the record's own payload, so that tab is always
 * loadable — but it is only MEANINGFUL where the institution keeps an
 * organizational chart, and `/admin/staff-assignments` refuses the rest with a
 * domain 404 saying their divisions are their sections. Leave and payslips sit
 * behind `module:hr` and `module:payroll`, which an institution may not hold.
 * A tab that is drawn and then answers 403 is worse than one that was never
 * there.
 */
export function StaffDetailPage() {
  const { staffId } = useParams({ from: '/app/staff/$staffId' })
  const perms = usePermissions()
  const modules = useModules()
  const { access } = useTenant()
  const tabsId = useId()

  const [addingQualification, setAddingQualification] = useState(false)

  const rawSearch = useSearch({ strict: false })
  const listSearch = useMemo(() => readStaffListSearch(rawSearch), [rawSearch])

  const record = useQuery({
    queryKey: hrKeys.staff(staffId),
    queryFn: () => staffApi.detail(staffId),
  })

  const photo = useStaffPhoto(staffId, record.data?.person.has_photo ?? false)

  const tabs: TabItem[] = [
    { key: 'overview', label: 'Overview', icon: <IdentificationBadge size={14} /> },
  ]

  if (access?.institution.supports_organizational_units !== false) {
    tabs.push({ key: 'assignments', label: 'Postings', icon: <Buildings size={14} /> })
  }
  tabs.push({ key: 'qualifications', label: 'Qualifications', icon: <Certificate size={14} /> })
  if (modules.has('hr') && perms.has('hr.view')) {
    tabs.push({ key: 'leave', label: 'Leave', icon: <Sun size={14} /> })
  }
  if (modules.has('payroll') && perms.has('payroll.view')) {
    tabs.push({ key: 'payslips', label: 'Payslips', icon: <Receipt size={14} /> })
  }

  const [tab, setTab] = useState('overview')
  const active = tabs.some((item) => item.key === tab) ? tab : 'overview'

  const backLink = (
    <Link
      to="/staff"
      search={toStaffListQuery(listSearch)}
      className="inline-flex items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={12} weight="bold" />
      All staff
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
        title={data?.person.full_name ?? ' '}
        icon={
          <EntityIcon>
            <IdentificationBadge size={18} />
          </EntityIcon>
        }
        meta={
          data && (
            <>
              <StatusBadge status={data.employment_status} />
              {data.employee_number && (
                <>
                  <MetaDot />
                  <span className="tabular">{data.employee_number}</span>
                </>
              )}
              {data.job_title && (
                <>
                  <MetaDot />
                  <span>{data.job_title}</span>
                </>
              )}
              {data.hire_date && (
                <>
                  <MetaDot />
                  <span>Hired {formatDate(data.hire_date)}</span>
                </>
              )}
            </>
          )
        }
      />

      {record.isLoading && <StaffRecordSkeleton />}

      {data && (
        <div>
          <Tabs items={tabs} value={active} onChange={setTab} baseId={tabsId} />

          <div
            role="tabpanel"
            id={panelId(tabsId, active)}
            aria-labelledby={`${tabsId}-tab-${active}`}
            className="pt-5"
          >
            {active === 'overview' && <StaffOverview record={data} photo={photo} />}
            {active === 'assignments' && <StaffAssignments record={data} />}
            {active === 'qualifications' && (
              <StaffQualifications
                staffId={staffId}
                canManage={perms.has('staff.manage')}
                onAdd={() => setAddingQualification(true)}
              />
            )}
            {active === 'leave' && <StaffLeave staffId={staffId} />}
            {active === 'payslips' && <StaffPayslips staffId={staffId} />}
          </div>
        </div>
      )}

      <QualificationDialog
        open={addingQualification}
        onClose={() => setAddingQualification(false)}
        staffId={staffId}
      />
    </PageStack>
  )
}
