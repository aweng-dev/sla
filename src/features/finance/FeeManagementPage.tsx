import { Link } from '@tanstack/react-router'
import { ArrowRight, ListChecks } from '@phosphor-icons/react'
import { Card, EmptyState } from '@/shared/ui'
import { ModuleGate } from '@/shared/layout/ModuleGate'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { FeeStructuresTab } from './FeeStructuresTab'

/**
 * What the institution charges.
 *
 * ── Why this is its own screen and not a tab ───────────────────────────────
 *
 * The rail carries `fee_management` as its own item, so it needs somewhere to
 * land — before this it fell through to the module scaffold. And the work is
 * genuinely separate from the work on `/finance`: a fee structure is written
 * once a session, by whoever sets prices, and is then assigned to cohorts.
 * Invoices, payments and chasing arrears are a different job, done daily, by
 * people who never touch a price list.
 *
 * The same component renders in both places. It is one surface — the
 * `/admin/finance/fee-structures` endpoints — and a second implementation
 * would be a second place for the assignment rules to drift.
 *
 * ── `fee_management` gates no endpoints, and that is why the gate is here ──
 *
 * Every finance route in the API carries `module:finance`; nothing carries
 * `module:fee_management`. So this screen is gated on the module the RAIL drew
 * it from — otherwise an institution that switched fee management off would
 * still reach the price list — while every request behind it is checked against
 * `module:finance` by the API, as it should be.
 *
 * Its access profiles are `institution_full` and `finance_management` only:
 * no learner ever reaches this, which is why there is no family surface here
 * the way there is on `/finance`.
 */
export function FeeManagementPage() {
  const t = useTerminology()
  const permissions = usePermissions()

  return (
    <ModuleGate
      module="fee_management"
      title="Fees"
      description={`What a place costs: the fee structures for a session, and which ${t('learners').toLowerCase()} each one applies to.`}
      offTitle="This institution does not manage fees here"
      offDescription="Fee management is switched off. An administrator can enable it from the institution's modules."
    >
      {permissions.has('finance.view') ? (
        <div className="flex flex-col gap-4">
          <FeeStructuresTab />

          {/* Where the money goes next. A price list is the start of a chain,
            * and the person who has just written one usually wants to see what
            * it produced. */}
          <Card>
            <Link
              to="/finance"
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
                <ListChecks size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  Invoices, payments and scholarships
                </span>
                <span className="block text-2xs text-gray-600">
                  What these structures have billed, and what has come back in.
                </span>
              </span>
              <ArrowRight size={15} className="shrink-0 text-gray-500" />
            </Link>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<ListChecks size={20} />}
            title="Your role does not include fees"
            description="Fee structures are read and written with the finance permission. Whoever administers roles here can grant it."
          />
        </Card>
      )}
    </ModuleGate>
  )
}
