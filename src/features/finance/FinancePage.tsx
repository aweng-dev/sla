import { useState } from 'react'
import { ChartBar, Coins, ListChecks, Medal, Receipt } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { EmptyState, PageHeader, Tabs, panelId } from '@/shared/ui'
import { usePermissions, useTenant } from '@/features/tenant/TenantProvider'
import { OverviewTab } from './OverviewTab'
import { InvoicesTab } from './InvoicesTab'
import { PaymentsTab } from './PaymentsTab'
import { FeeStructuresTab } from './FeeStructuresTab'
import { ScholarshipsTab } from './ScholarshipsTab'

/**
 * Student finance.
 *
 * The order of the tabs is the order the money moves: what a place costs
 * (structures) → what a learner has been charged (invoices) → what has been
 * received (payments) → what was forgiven (scholarships), with the overview
 * in front of all of it.
 *
 * ── What is deliberately absent ────────────────────────────────────────────
 *
 * There is no webhook-events surface. `GET /admin/finance/payment-events`
 * answers 500 — its `payment_webhook_events` table has no migration — and a
 * tab that is always an error is worse than no tab. Worth fixing in `slb`;
 * the screen is a small addition once it answers.
 */

const ALL_TABS = [
  { key: 'overview', label: 'Overview', icon: <ChartBar size={14} /> },
  { key: 'invoices', label: 'Invoices', icon: <Receipt size={14} /> },
  { key: 'payments', label: 'Payments', icon: <Coins size={14} /> },
  { key: 'structures', label: 'Fee structures', icon: <ListChecks size={14} /> },
  { key: 'scholarships', label: 'Scholarships', icon: <Medal size={14} /> },
] as const

type TabId = (typeof ALL_TABS)[number]['key']

export function FinancePage() {
  const perms = usePermissions()
  const { access } = useTenant()
  const [tab, setTab] = useState<TabId>('overview')
  const baseId = 'finance-tabs'

  if (!perms.has('finance.view')) {
    return (
      <PageStack>
        <PageHeader title="Finance" />
        <EmptyState
          icon={<Coins size={20} />}
          title="You do not have access to finance"
          description="Ask an administrator for the finance permission."
        />
      </PageStack>
    )
  }

  const session = access?.calendar?.session
  const period = access?.calendar?.period

  return (
    <PageStack>
      <PageHeader
        title="Finance"
        meta={
          session ? (
            <span>
              {session.name}
              {period ? ` · ${period.name}` : ''}
            </span>
          ) : undefined
        }
      />

      <div>
        <Tabs
          baseId={baseId}
          items={[...ALL_TABS]}
          value={tab}
          onChange={(key) => setTab(key as TabId)}
        />

        <div
          role="tabpanel"
          id={panelId(baseId, tab)}
          aria-labelledby={`${baseId}-tab-${tab}`}
          className="pt-5"
        >
          {tab === 'overview' && <OverviewTab />}
          {tab === 'invoices' && <InvoicesTab sessionId={session?.id} />}
          {tab === 'payments' && <PaymentsTab />}
          {tab === 'structures' && <FeeStructuresTab />}
          {tab === 'scholarships' && <ScholarshipsTab />}
        </div>
      </div>
    </PageStack>
  )
}
