import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowSquareOut, CheckCircle, Receipt, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Segmented,
  Skeleton,
  StatTile,
  StatusBadge,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, formatMoney, formatNumber, formatRelative } from '@/shared/lib/format'
import { useTerminology, useViewer } from '@/features/tenant/TenantProvider'
import {
  familyFinanceApi,
  familyFinanceKeys,
  type FamilyInvoice,
  type PaymentIntent,
} from '../finance.api'
import { PayInvoiceDialog } from './PayInvoiceDialog'

/**
 * What is owed, and paying it.
 *
 * ── The balance is the server's, computed once ─────────────────────────────
 *
 * `/portal/finance/balance` is the same computation the bursar's screen renders,
 * which is the point: a family's balance is the number that says who is
 * struggling to pay, and two implementations of it would eventually disagree in
 * front of a parent. Nothing here adds invoices up.
 *
 * ── `is_settleable` decides whether a bill can be paid ─────────────────────
 *
 * Not a balance greater than zero, and not a status this screen interprets. A
 * client that worked it out itself would offer Pay on a voided or frozen
 * invoice and the checkout would refuse — which, on a bill, reads as the school
 * refusing money.
 *
 * ── A payment in progress is neither paid nor lost ─────────────────────────
 *
 * Starting a checkout creates an intent and sends the payer to a provider. Until
 * that provider confirms, the bill still shows what is owed — because it IS
 * still owed — and the intent sits beside it so somebody who closed the tab can
 * come back and have it checked. Showing the bill as paid at this point is how a
 * school loses money and a family loses trust in one step.
 */
export function MyFinance() {
  const t = useTerminology()
  const viewer = useViewer()
  const queryClient = useQueryClient()

  const [view, setView] = useState<'bills' | 'payments'>('bills')
  const [paying, setPaying] = useState<FamilyInvoice | null>(null)
  /** Intents opened this session, by invoice. Not persisted — the bill's own
   *  balance is the durable truth, and this is only a way back to the tab. */
  const [started, setStarted] = useState<Record<string, PaymentIntent>>({})

  const balance = useQuery({
    queryKey: familyFinanceKeys.balance(),
    queryFn: () => familyFinanceApi.balance(),
  })

  const invoices = useQuery({
    queryKey: familyFinanceKeys.invoices(),
    queryFn: () => familyFinanceApi.invoices(),
  })

  const payments = useQuery({
    queryKey: familyFinanceKeys.payments(),
    queryFn: () => familyFinanceApi.payments(),
    enabled: view === 'payments',
  })

  const rows = invoices.data ?? []
  const owing = useMemo(() => rows.filter((row) => row.balance_minor > 0), [rows])

  async function check(intent: PaymentIntent) {
    try {
      const fresh = await familyFinanceApi.verify(intent.reference)
      setStarted((current) => ({ ...current, [fresh.invoice_id ?? '']: fresh }))
      queryClient.invalidateQueries({ queryKey: familyFinanceKeys.root })

      toast.success(
        fresh.is_settled
          ? 'Payment confirmed. Your balance has been updated.'
          : fresh.failure_reason
            ? `The provider says: ${fresh.failure_reason}`
            : 'Not confirmed yet. If you have just paid, give it a moment and check again.',
      )
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That payment could not be checked.',
      )
    }
  }

  if (balance.isError) {
    return (
      <Card>
        <ErrorState error={balance.error} onRetry={() => balance.refetch()} />
      </Card>
    )
  }

  const figures = balance.data
  const currency = figures?.currency ?? 'NGN'

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Outstanding"
            value={formatMoney(figures?.balance_minor ?? 0, currency)}
            hint={figures?.is_settled ? 'Nothing owed' : `across ${formatNumber(owing.length)} bill(s)`}
            icon={<Receipt size={16} />}
            loading={balance.isLoading}
          />
          <StatTile
            label="Overdue"
            value={formatMoney(figures?.overdue_minor ?? 0, currency)}
            hint={
              (figures?.overdue_minor ?? 0) > 0
                ? 'Past its due date'
                : 'Nothing past its due date'
            }
            icon={<Warning size={16} />}
            loading={balance.isLoading}
          />
          <StatTile
            label="Paid so far"
            value={formatMoney(figures?.paid_minor ?? 0, currency)}
            /* Money received and not yet applied to a bill is a real state and
             * a confusing one to meet without explanation. */
            hint={
              (figures?.unallocated_minor ?? 0) > 0
                ? `${formatMoney(figures!.unallocated_minor, currency)} not yet applied to a bill`
                : undefined
            }
            icon={<CheckCircle size={16} />}
            loading={balance.isLoading}
          />
        </div>

        <Segmented
          label="What to show"
          value={view}
          onChange={(value) => setView(value as 'bills' | 'payments')}
          options={[
            { value: 'bills', label: 'Bills' },
            { value: 'payments', label: 'Payments made' },
          ]}
        />

        {view === 'bills' ? (
          <Card>
            <CardHeader
              title="Bills"
              subtitle={
                viewer.isGuardian && !viewer.isStudent
                  ? `Everything billed to the ${t('learners').toLowerCase()} you are responsible for.`
                  : 'Everything billed to you.'
              }
            />

            {invoices.isError ? (
              <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
            ) : invoices.isLoading ? (
              <div className="space-y-2 p-4" aria-hidden>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Receipt size={20} />}
                title="No bills"
                description="Fees appear here once they are issued for the session."
              />
            ) : (
              <ul className="divide-y divide-gray-200">
                {rows.map((invoice) => (
                  <li key={invoice.id} className="px-4 py-3">
                    <InvoiceRow
                      invoice={invoice}
                      showStudent={viewer.isGuardian}
                      intent={started[invoice.id] ?? null}
                      onPay={() => setPaying(invoice)}
                      onCheck={check}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card>
            <CardHeader title="Payments made" subtitle="What has reached the institution." />

            {payments.isError ? (
              <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
            ) : payments.isLoading ? (
              <div className="space-y-2 p-4" aria-hidden>
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (payments.data ?? []).length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Payments appear here once the provider or the finance office confirms them."
              />
            ) : (
              <ul className="divide-y divide-gray-200">
                {(payments.data ?? []).map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900">
                        {formatMoney(payment.amount_minor, payment.currency)}
                      </span>
                      <span className="block truncate text-2xs text-gray-600">
                        {payment.reference} · {payment.method}
                        {payment.paid_at && ` · ${formatDate(payment.paid_at)}`}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-2">
                      {payment.reversed_at && <Badge tone="danger">Reversed</Badge>}
                      <StatusBadge status={payment.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <PayInvoiceDialog
        invoice={paying}
        onClose={() => setPaying(null)}
        onStarted={(intent) => {
          setPaying(null)
          if (intent.invoice_id) {
            setStarted((current) => ({ ...current, [intent.invoice_id!]: intent }))
          }
        }}
      />
    </>
  )
}

function InvoiceRow({
  invoice,
  showStudent,
  intent,
  onPay,
  onCheck,
}: {
  invoice: FamilyInvoice
  showStudent: boolean
  intent: PaymentIntent | null
  onPay: () => void
  onCheck: (intent: PaymentIntent) => void
}) {
  const overdue =
    invoice.balance_minor > 0 &&
    invoice.due_on !== null &&
    new Date(invoice.due_on).getTime() < Date.now()

  return (
    <article className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-gray-900">{invoice.invoice_number}</h3>
          <StatusBadge status={invoice.status} />
          {invoice.voided_at && <Badge tone="neutral">Void</Badge>}
        </div>

        <p className="mt-0.5 text-2xs text-gray-600">
          {showStudent && invoice.student?.name && `${invoice.student.name} · `}
          {invoice.due_on ? (
            <span className={overdue ? 'text-danger-600' : undefined}>
              due {formatRelative(invoice.due_on)}
            </span>
          ) : (
            'no due date'
          )}
          {invoice.paid_minor > 0 &&
            ` · ${formatMoney(invoice.paid_minor, invoice.currency)} paid`}
        </p>

        {/* Started, not settled. The bill still shows what is owed, because it
          * is still owed — and this is the way back to a closed tab. */}
        {intent && !intent.is_settled && (
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-gray-600">
            <span>
              A payment of {formatMoney(intent.amount_minor, intent.currency)} was started and has
              not been confirmed.
            </span>
            <Button size="sm" variant="ghost" onClick={() => onCheck(intent)}>
              Check it
            </Button>
            {intent.checkout_url && (
              <a
                href={intent.checkout_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent-500 underline-offset-2 hover:underline"
              >
                Reopen <ArrowSquareOut size={11} />
              </a>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm font-semibold text-gray-900 tabular">
          {formatMoney(invoice.balance_minor, invoice.currency)}
        </span>
        <span className="text-2xs text-gray-500 tabular">
          of {formatMoney(invoice.total_minor, invoice.currency)}
        </span>

        {/* The server's own answer. Never a balance this screen interprets. */}
        {invoice.is_settleable && invoice.balance_minor > 0 && (
          <Button size="sm" variant="primary" onClick={onPay}>
            Pay
          </Button>
        )}
      </div>
    </article>
  )
}
