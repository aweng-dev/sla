import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarDots } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatMoney, humanize } from '@/shared/lib/format'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { PageStack } from '@/shared/layout/AppShell'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  Blank,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Toolbar,
  type Column,
} from '@/shared/ui'
import {
  outstandingMinor,
  paymentPlanKeys,
  paymentPlansApi,
  settledCount,
  type PaymentPlan,
  type PaymentPlanInstallment,
  type PaymentPlanQuery,
} from './paymentPlans.api'

const PLAN_STATUSES = ['active', 'completed', 'defaulted', 'cancelled'] as const

/**
 * Invoices somebody is paying in instalments.
 *
 * ── There is no "New plan" button ──────────────────────────────────────────
 *
 * A plan is created against the invoice it settles, because the amount it
 * schedules is that invoice's own. The create therefore lives on the invoice,
 * and offering one here would mean asking a bursar to pick from a dropdown of
 * every unpaid bill in the institution.
 *
 * ── The schedule is beside the list, not behind a click ────────────────────
 *
 * Instalments arrive inline with the list, so opening one costs nothing. The
 * question a bursar has is "which instalment is late", and that is answered by
 * the schedule rather than by the plan's own row.
 */
export function PaymentPlansPage() {
  const t = useTerminology()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const query = useMemo<PaymentPlanQuery>(
    () => ({ status: status || undefined, page, per_page: PER_PAGE_DEFAULT }),
    [status, page],
  )

  const plans = useQuery({
    queryKey: paymentPlanKeys.list(query),
    queryFn: () => paymentPlansApi.list(query),
    placeholderData: (previous) => previous,
  })

  const rows = plans.data?.rows ?? []
  const selected = rows.find((row) => row.id === selectedId) ?? null

  const columns: Column<PaymentPlan>[] = [
    {
      key: 'reference',
      header: 'Plan',
      className: 'tabular',
      cell: (row) =>
        row.reference ? (
          <span className="font-mono text-[0.6875rem]">{row.reference}</span>
        ) : (
          <Blank />
        ),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      cell: (row) => formatMoney(row.total_minor, row.currency),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      numeric: true,
      cell: (row) => {
        const owed = outstandingMinor(row)
        return (
          <span className={cn('font-medium', owed > 0 ? 'text-gray-900' : 'text-gray-500')}>
            {formatMoney(owed, row.currency)}
          </span>
        )
      },
    },
    {
      key: 'progress',
      header: 'Instalments',
      width: '9rem',
      className: 'tabular',
      cell: (row) => `${settledCount(row)} of ${row.installment_count} paid`,
    },
    {
      key: 'agreed',
      header: 'Agreed',
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.agreed_at ? formatDate(row.agreed_at) : <Blank />),
    },
    { key: 'status', header: 'Status', width: '8rem', cell: (row) => <StatusBadge status={row.status} /> },
  ]

  if (plans.isError) {
    return (
      <PageStack>
        <PageHeader title="Payment plans" />
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader
        title="Payment plans"
        description={`Invoices a family is settling in instalments. A plan is agreed against the invoice it pays, so it is created from the ${t('learner').toLowerCase()}'s bill rather than here.`}
      />

      <Toolbar
        className="pt-0"
        filters={
          <>
            <div className="w-40">
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setPage(1)
                }}
                aria-label="Filter by status"
                options={[
                  { value: '', label: 'Any status' },
                  ...PLAN_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
                ]}
              />
            </div>
            {status && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setStatus('')
                  setPage(1)
                }}
              >
                Clear filter
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={plans.isLoading}
            skeletonRows={8}
            onRowClick={(row) => setSelectedId(row.id)}
            selectedIds={selectedId ? new Set([selectedId]) : undefined}
            className={plans.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
            empty={
              <EmptyState
                icon={<CalendarDots size={20} />}
                title={status ? 'No plans with this status' : 'No payment plans yet'}
                description={
                  status
                    ? 'Nothing on file answers to this status.'
                    : 'A plan is agreed against an invoice, splitting it into instalments with their own due dates. Open an unpaid invoice to offer one.'
                }
              />
            }
          />

          {plans.data?.pagination && (
            <Pagination pagination={plans.data.pagination} onPageChange={setPage} />
          )}
        </div>

        <div className="min-w-0">
          {selected ? (
            <Schedule plan={selected} />
          ) : (
            !plans.isLoading &&
            rows.length > 0 && (
              <Card>
                <EmptyState
                  title="No plan selected"
                  description="Choose a plan to see its schedule."
                />
              </Card>
            )
          )}
        </div>
      </div>
    </PageStack>
  )
}

/** The instalments, in order, with what is left on each. */
function Schedule({ plan }: { plan: PaymentPlan }) {
  const today = new Date().toISOString().slice(0, 10)

  const columns: Column<PaymentPlanInstallment>[] = [
    {
      key: 'number',
      header: '#',
      width: '3rem',
      className: 'tabular',
      cell: (row) => row.installment_number,
    },
    {
      key: 'due',
      header: 'Due',
      className: 'tabular',
      cell: (row) => {
        if (!row.due_on) return <Blank />
        const settled = row.paid_minor >= row.amount_minor
        /* Late is a comparison against today AND against what is still owed.
         * A past instalment that is paid is not late, and colouring it red
         * would make a healthy plan look distressed. */
        const late = !settled && row.due_on < today
        return (
          <span className={late ? 'font-medium text-danger-500' : undefined}>
            {formatDate(row.due_on)}
            {late && ' · overdue'}
          </span>
        )
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      cell: (row) => formatMoney(row.amount_minor, plan.currency),
    },
    {
      key: 'owed',
      header: 'Left',
      numeric: true,
      cell: (row) => {
        const owed = Math.max(0, row.amount_minor - row.paid_minor)
        return owed === 0 ? (
          <span className="text-gray-500">Paid</span>
        ) : (
          formatMoney(owed, plan.currency)
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={plan.reference ?? 'Payment plan'} subtitle="What was agreed." />
        <Facts>
          <Fact label="Total">{formatMoney(plan.total_minor, plan.currency)}</Fact>
          <Fact label="Outstanding">
            <span className="font-medium">
              {formatMoney(outstandingMinor(plan), plan.currency)}
            </span>
          </Fact>
          <Fact label="Instalments">
            <span className="tabular">
              {settledCount(plan)} of {plan.installment_count} paid
            </span>
          </Fact>
          <Fact label="Agreed">{plan.agreed_at ? formatDate(plan.agreed_at) : <Blank />}</Fact>
          <Fact label="Status">
            <StatusBadge status={plan.status} />
          </Fact>
          <Fact label="Invoice">
            {/* The plan settles one invoice, and that is where a bursar goes
              * to see what was billed and to take a payment against it. */}
            <Link
              to="/finance/invoices/$invoiceId"
              params={{ invoiceId: plan.invoice_id }}
              className="text-accent-500 hover:underline"
            >
              Open the invoice
            </Link>
          </Fact>
        </Facts>
      </Card>

      <Card>
        <CardHeader title="Schedule" subtitle="Each instalment, and what is left on it." />
        <DataTable
          rows={[...plan.installments].sort((a, b) => a.installment_number - b.installment_number)}
          columns={columns}
          rowKey={(row) => row.id}
          className="border-0"
          empty={<EmptyState title="No instalments on this plan" />}
        />
      </Card>
    </div>
  )
}
