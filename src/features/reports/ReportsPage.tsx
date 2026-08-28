import { useState } from 'react'
import { ChartBar, Export, FileText } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { EmptyState, PageHeader, Tabs, panelId } from '@/shared/ui'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { AnalyticsTab } from './AnalyticsTab'
import { DefinitionsTab } from './DefinitionsTab'
import { ExportsTab } from './ExportsTab'

/**
 * Reports and Analytics.
 *
 * Three things that are often conflated and are genuinely distinct:
 *
 *   ANALYTICS  figures the API computes and this screen renders. Read-only,
 *              always current, nothing to configure.
 *   REPORTS    saved questions. Run on demand, shared, scheduled, downloaded.
 *   EXPORTS    one-off extracts with nothing saved.
 *
 * They are tabs rather than three items in the rail because they are one
 * subject — "what does this institution look like" — approached at three
 * different levels of commitment, and a reader who wants the second usually
 * arrives at the first.
 */

const TAB_IDS = ['analytics', 'reports', 'exports'] as const
type TabId = (typeof TAB_IDS)[number]

export function ReportsPage() {
  const perms = usePermissions()
  const t = useTerminology()
  const { access } = useTenant()
  const [tab, setTab] = useState<TabId>('analytics')

  const baseId = 'reports-tabs'
  const canSeeReports = perms.has('reports.view')

  /* `reports.view` gates the saved-report machinery. The analytics half rests
   * on the dashboard, students and finance modules instead, so a reader can
   * legitimately hold one and not the other. */
  if (!canSeeReports && !perms.has('dashboard.view')) {
    return (
      <PageStack>
        <PageHeader title="Reports and Analytics" />
        <EmptyState
          icon={<ChartBar size={20} />}
          title="You do not have access to reporting"
          description="Ask an administrator for the reports or dashboard permission."
        />
      </PageStack>
    )
  }

  const items = [
    { key: 'analytics', label: 'Analytics', icon: <ChartBar size={14} /> },
    ...(canSeeReports
      ? [
          { key: 'reports', label: 'Reports', icon: <FileText size={14} /> },
          { key: 'exports', label: 'Exports', icon: <Export size={14} /> },
        ]
      : []),
  ]

  const session = access?.calendar?.session?.name
  const period = access?.calendar?.period?.name

  return (
    <PageStack>
      <PageHeader
        title="Reports and Analytics"
        description={`How ${t('learners').toLowerCase()}, attendance, staffing and fees are moving — and the reports you can save, share and schedule.`}
        meta={
          session ? (
            <span>
              {session}
              {period ? ` · ${period}` : ''}
            </span>
          ) : undefined
        }
      />

      <div>
        <Tabs
          baseId={baseId}
          items={items}
          value={tab}
          onChange={(key) => setTab(key as TabId)}
        />

        <div
          role="tabpanel"
          id={panelId(baseId, tab)}
          aria-labelledby={`${baseId}-tab-${tab}`}
          className="pt-5"
        >
          {tab === 'analytics' && <AnalyticsTab />}
          {tab === 'reports' && canSeeReports && <DefinitionsTab />}
          {tab === 'exports' && canSeeReports && <ExportsTab />}
        </div>
      </div>
    </PageStack>
  )
}
