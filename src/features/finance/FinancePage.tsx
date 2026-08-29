import { useState } from 'react'
import { ChartBar, Coins, Lightning, ListChecks, Medal, Plug, Receipt } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { EmptyState, PageHeader, Tabs, panelId } from '@/shared/ui'
import { usePermissions, useTenant, useViewer } from '@/features/tenant/TenantProvider'
import { MyFinance } from '@/features/portal/components/MyFinance'
import { OverviewTab } from './OverviewTab'
import { InvoicesTab } from './InvoicesTab'
import { PaymentsTab } from './PaymentsTab'
import { FeeStructuresTab } from './FeeStructuresTab'
import { ScholarshipsTab } from './ScholarshipsTab'
import { PaymentEventsTab } from './PaymentEventsTab'
import { PaymentProvidersTab } from './PaymentProvidersTab'

/**
 * Student finance.
 *
 * The order of the tabs is the order the money moves: what a place costs
 * (structures) → what a learner has been charged (invoices) → what has been
 * received (payments) → what was forgiven (scholarships), with the overview
 * in front of all of it.
 *
 * ── The last tab is the mechanism, not the result ──────────────────────────
 *
 * Gateway events used to be deliberately absent: `payment_webhook_events` had
 * no migration and the endpoint answered 500, so a tab there was always an
 * error. The table exists now, so the tab does — and it earns its place,
 * because it is the only screen that can answer "I paid and it still shows
 * unpaid". Everything before it shows what the money DID; that one shows where
 * it stopped.
 *
 * ── Providers is where the money loop starts ───────────────────────────────
 *
 * Nothing else here can run until an institution has connected a gateway:
 * `ResolvePaymentGateway` reports the providers with an ACTIVE connection, and
 * with none the family's Pay button becomes "no online payment method set up".
 * That tab is gated on `module:integrations` rather than `module:finance`,
 * because a school can run fees and collect at the desk.
 *
 * ── A family sees a different screen entirely ──────────────────────────────
 *
 * `finance` reaches `student_self` and `guardian_children`, so the rail draws
 * this for a parent. They get MyFinance — their bills and a way to pay them —
 * because everything below speaks `/admin/finance/…` and would answer 403.
 */

const ALL_TABS = [
  { key: 'overview', label: 'Overview', icon: <ChartBar size={14} /> },
  { key: 'invoices', label: 'Invoices', icon: <Receipt size={14} /> },
  { key: 'payments', label: 'Payments', icon: <Coins size={14} /> },
  { key: 'structures', label: 'Fee structures', icon: <ListChecks size={14} /> },
  { key: 'scholarships', label: 'Scholarships', icon: <Medal size={14} /> },
  { key: 'events', label: 'Gateway events', icon: <Lightning size={14} /> },
  { key: 'providers', label: 'Payment providers', icon: <Plug size={14} /> },
] as const

type TabId = (typeof ALL_TABS)[number]['key']

export function FinancePage() {
  const perms = usePermissions()
  const { access } = useTenant()
  const viewer = useViewer()
  const [tab, setTab] = useState<TabId>('overview')
  const baseId = 'finance-tabs'

  /*
   * `finance` lists `student_self` and `guardian_children` among its access
   * profiles, so the rail draws this for a family — correctly, because a bill
   * is theirs. Everything below speaks `/admin/finance/…`, which carries the
   * `staff` middleware and answers 403 to them. The API has always had the
   * other side.
   *
   * Checked before the permission guard below: a parent holds `finance.view`
   * for their own children, so that guard would let them through to a screen
   * that then 403s on every request.
   */
  if (viewer.surface === 'learner') {
    return (
      <PageStack>
        <PageHeader
          title="Fees"
          description="What is owed, what has been paid, and paying what is left."
        />
        <MyFinance />
      </PageStack>
    )
  }

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
        tabs={
          <Tabs
            bare
            baseId={baseId}
            items={[...ALL_TABS]}
            value={tab}
            onChange={(key) => setTab(key as TabId)}
          />
        }
      />

      <div>
        <div
          role="tabpanel"
          id={panelId(baseId, tab)}
          aria-labelledby={`${baseId}-tab-${tab}`}
        >
          {tab === 'overview' && <OverviewTab />}
          {tab === 'invoices' && <InvoicesTab sessionId={session?.id} />}
          {tab === 'payments' && <PaymentsTab />}
          {tab === 'structures' && <FeeStructuresTab />}
          {tab === 'scholarships' && <ScholarshipsTab />}
          {tab === 'events' && <PaymentEventsTab />}
          {tab === 'providers' && <PaymentProvidersTab />}
        </div>
      </div>
    </PageStack>
  )
}
