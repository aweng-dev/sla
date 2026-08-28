import { useId, useState, type HTMLAttributes } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Receipt, Student as StudentIcon } from '@phosphor-icons/react'
import { qk } from '@/shared/api/queryKeys'
import { formatDate } from '@/shared/lib/format'
import { useModules, usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Blank,
  Card,
  CardFooter,
  CardHeader,
  EntityIcon,
  ErrorState,
  MetaDot,
  PageHeader,
  StatusBadge,
  Tabs,
  panelId,
  type TabItem,
} from '@/shared/ui'
import { Fact, Facts, Flag, RecordFinance, RecordOverview } from './StudentPanels'
import { portalApi, portalKeys } from './students.api'
import type { PortalStudentRecord } from './students.types'

/**
 * A student record as its own subject or their guardian sees it.
 *
 * ── Why this exists beside the staff screen ────────────────────────────────
 *
 * Everything under `/admin` needs a staff PROFILE, not a permission. A learner
 * and a guardian both hold `students.view`, and both are refused
 * `/admin/students/{id}` — a parent asking after their own child gets 403 with
 * "Staff access is required." So these two readers get their record from
 * `/portal/my-record`, which is 200 for both and already carries person,
 * programme, level, groups and both enrolments: every fact the header and the
 * overview need, in the request that established the entitlement.
 *
 * ── Only the panels that can answer ────────────────────────────────────────
 *
 * Placement history and guardians are `/admin/enrollments` and
 * `/admin/students/{id}/guardians`, both 403 here, so they are not offered —
 * `enrollment.view` and `guardians.view` being held says nothing about whether
 * the endpoint behind them will answer this caller. Fees are offered, because
 * `/portal/finance/*` does answer, for a learner and for a guardian naming a
 * child.
 */
export function useMyRecords() {
  return useQuery({
    queryKey: qk.portal.myRecord(),
    queryFn: portalApi.myRecord,
  })
}

export function PortalRecordView({ record }: { record: PortalStudentRecord }) {
  const t = useTerminology()
  const perms = usePermissions()
  const modules = useModules()
  const baseId = useId()

  const tabs: TabItem[] = [
    { key: 'overview', label: 'Overview', icon: <StudentIcon size={14} /> },
  ]
  if (modules.has('finance') && perms.has('finance.view')) {
    tabs.push({ key: 'fees', label: 'Fees', icon: <Receipt size={14} /> })
  }

  const [tab, setTab] = useState('overview')
  const active = tabs.some((item) => item.key === tab) ? tab : 'overview'
  const tabbed = tabs.length > 1

  /* A tablist of one is a widget that promises a choice it does not have, so
   * the strip appears only when there is somewhere else to go — and the panel
   * only claims the role the strip is pointing at. */
  const panelProps: HTMLAttributes<HTMLDivElement> = tabbed
    ? {
        role: 'tabpanel',
        id: panelId(baseId, active),
        'aria-labelledby': `${baseId}-tab-${active}`,
      }
    : {}

  return (
    <>
      <PageHeader
        icon={
          <EntityIcon tone="accent">
            <StudentIcon size={18} />
          </EntityIcon>
        }
        title={record.person.full_name}
        meta={
          <>
            <span className="tabular">{record.student_number}</span>
            <MetaDot />
            <span>
              {record.learning_groups.length > 0
                ? record.learning_groups.map((group) => group.name).join(', ')
                : `No ${t('group').toLowerCase()}`}
            </span>
            <MetaDot />
            <StatusBadge status={record.status} />
            {record.admission_date && (
              <>
                <MetaDot />
                <span>Admitted {formatDate(record.admission_date)}</span>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {tabbed && <Tabs items={tabs} value={active} onChange={setTab} baseId={baseId} />}

        <div {...panelProps}>
          {/* No photograph: `/admin/students/{id}/photo` is a staff route like
              the rest of `/admin`, so there are no bytes to ask for here and
              the initials avatar is the whole answer. */}
          {active === 'overview' && <RecordOverview record={record} photo={null} />}
          {active === 'fees' && <PortalFees studentId={record.student_id} />}
        </div>
      </div>
    </>
  )
}

function PortalFees({ studentId }: { studentId: string }) {
  const balance = useQuery({
    queryKey: portalKeys.balance(studentId),
    queryFn: () => portalApi.balance(studentId),
  })

  const invoices = useQuery({
    queryKey: portalKeys.invoices(studentId),
    queryFn: () => portalApi.invoices(studentId),
  })

  if (balance.isError) {
    return <ErrorState error={balance.error} onRetry={() => balance.refetch()} />
  }

  return (
    <RecordFinance
      balance={balance.data}
      balanceLoading={balance.isLoading}
      invoices={invoices.data ?? []}
      invoicesLoading={invoices.isLoading}
      invoicesError={invoices.error}
      onRetryInvoices={() => invoices.refetch()}
    />
  )
}

/**
 * One record, as a card in a guardian's list.
 *
 * The facts are the registry ones — where the child is placed and whether they
 * are on the roll. Attendance and fees are deliberately not repeated from the
 * dashboard, which already answers "how is my child doing this week"; this
 * screen answers "what does the school hold about them", and the card is the
 * way into the rest of it.
 */
export function PortalRecordCard({ record }: { record: PortalStudentRecord }) {
  const t = useTerminology()

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Avatar name={record.person.full_name} size="sm" />
            {record.person.preferred_name ?? record.person.full_name}
          </span>
        }
        subtitle={<span className="tabular">{record.student_number}</span>}
        actions={<StatusBadge status={record.status} />}
      />

      <div className="flex-1">
        <Facts>
          <Fact label={t('programme')}>{record.program?.name ?? <Blank />}</Fact>
          <Fact label={t('level')}>{record.level?.name ?? <Blank />}</Fact>
          <Fact label={t('group')}>
            {record.learning_groups.length > 0 ? (
              record.learning_groups.map((group) => group.name).join(', ')
            ) : (
              <Blank />
            )}
          </Fact>
          <Fact label="On roll">
            <Flag on={record.is_on_roll}>{record.is_on_roll ? 'On roll' : 'Off roll'}</Flag>
          </Fact>
          <Fact label="Admitted">
            {record.admission_date ? formatDate(record.admission_date) : <Blank />}
          </Fact>
        </Facts>
      </div>

      {/* A white button with a hairline, as Sprig ends a card with — not a
          small accent-coloured text link floated to the right, which was the
          only saturated thing on the screen and the quietest shape on it. */}
      <CardFooter className="justify-start">
        <Link
          to="/students/$studentId"
          params={{ studentId: record.student_id }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
        >
          Open record
          <ArrowRight size={13} weight="bold" className="text-gray-600" />
        </Link>
      </CardFooter>
    </Card>
  )
}
