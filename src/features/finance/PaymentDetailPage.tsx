import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUUpLeft, Coins, Link as LinkIcon, Warning } from '@phosphor-icons/react'
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  EntityIcon,
  ErrorState,
  MetaDot,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { formatDate, formatDateTime } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { financeApi, financeKeys } from './finance.api'
import { Money } from './components/money'
import { InvoiceStatusPill, methodLabel, PaymentStatusPill } from './components/StatusPill'
import { DetailPanel, DetailSection, Fact, Facts } from './components/DetailPanel'
import {
  AllocatePaymentDialog,
  RefundDialog,
  ReversePaymentDialog,
} from './dialogs/PaymentDialogs'

/**
 * One payment, and what it settled.
 *
 * ── Allocations are the point of this screen ───────────────────────────────
 *
 * A payment is money, not a receipt for one invoice. It carries allocations,
 * and whatever is left over is credit on the learner's account. So the
 * allocations table is the body of the page and `unallocated_minor` is called
 * out — that leftover is the number a bursar chases when a parent insists they
 * have paid.
 */
export function PaymentDetailPage() {
  const { paymentId } = useParams({ strict: false }) as { paymentId: string }
  const t = useTerminology()
  const perms = usePermissions()
  const [allocating, setAllocating] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [reversing, setReversing] = useState(false)

  const query = useQuery({
    queryKey: financeKeys.payment(paymentId),
    queryFn: () => financeApi.payment(paymentId),
  })

  /*
   * ── This endpoint is currently broken server-side ─────────────────────────
   *
   * `GET /admin/finance/payments/{id}/refunds` answers 500: its
   * `payment_refunds` table has no migration in `slb`. Confirmed against the
   * running API, not inferred from a failed request.
   *
   * So it is asked once, without retries, and its failure is treated as "this
   * capability is not available here" rather than as an error on the page —
   * and the refund ACTION is disabled with it, because a button whose endpoint
   * cannot succeed is a worse answer than an absent one.
   */
  const refunds = useQuery({
    queryKey: financeKeys.refunds(paymentId),
    queryFn: () => financeApi.refunds(paymentId),
    enabled: perms.has('finance.refunds') || perms.has('finance.manage'),
    retry: false,
  })

  const refundsUnavailable = refunds.isError

  if (query.isLoading) {
    return (
      <PageStack>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  if (query.isError || !query.data) {
    return (
      <PageStack>
        <Back />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </PageStack>
    )
  }

  const payment = query.data
  const canManage = perms.has('finance.manage')
  const live = payment.status === 'confirmed'

  return (
    <PageStack>
      <Back />

      <PageHeader
        icon={
          <EntityIcon>
            <Coins size={17} />
          </EntityIcon>
        }
        title={payment.reference}
        meta={
          <>
            <Link
              to="/students/$studentId"
              params={{ studentId: payment.student_id }}
              className="inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900"
            >
              <Avatar name={payment.student.name} size="sm" />
              {payment.student.name}
            </Link>
            <MetaDot />
            <PaymentStatusPill status={payment.status} />
            <MetaDot />
            <span>{methodLabel(payment.method)}</span>
            {payment.paid_at && (
              <>
                <MetaDot />
                <span>Received {formatDate(payment.paid_at)}</span>
              </>
            )}
          </>
        }
        actions={
          canManage &&
          live && (
            <>
              {!refundsUnavailable && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Refund"
                  onClick={() => setRefunding(true)}
                >
                  <ArrowUUpLeft size={15} />
                </Button>
              )}
              <Button onClick={() => setReversing(true)}>Reverse</Button>
              {payment.unallocated_minor > 0 && (
                <Button
                  variant="primary"
                  icon={<LinkIcon size={13} />}
                  onClick={() => setAllocating(true)}
                >
                  Apply to invoices
                </Button>
              )}
            </>
          )
        }
      />

      {payment.status === 'reversed' && (
        <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Warning size={16} className="mt-0.5 shrink-0 text-gray-600" />
          <div className="text-sm">
            <p className="font-medium text-gray-900">This payment was reversed</p>
            <p className="mt-0.5 text-gray-700">
              {payment.reversal_reason ?? 'No reason was recorded.'}
              {payment.reversed_at && ` · ${formatDateTime(payment.reversed_at)}`}
            </p>
          </div>
        </div>
      )}

      {payment.status === 'pending' && (
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <Warning size={16} className="mt-0.5 shrink-0 text-gray-700" />
          <div className="text-sm">
            <p className="font-medium text-gray-900">Not yet confirmed</p>
            <p className="mt-0.5 text-gray-700">
              An unconfirmed payment does not reduce any balance and cannot be applied to an
              invoice.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <Card>
            <CardHeader
              title="Applied to"
              subtitle={
                payment.allocations.length === 0
                  ? 'Nothing yet — the whole amount is credit on the account.'
                  : `${payment.allocations.length} invoice${payment.allocations.length === 1 ? '' : 's'}`
              }
            />
            <CardBody className="p-0">
              {payment.allocations.length === 0 ? (
                <EmptyState
                  title="Not applied to any invoice"
                  description={
                    live
                      ? 'The money is on the account as credit. Apply it to an invoice to reduce a balance.'
                      : 'Only a confirmed payment can be applied.'
                  }
                />
              ) : (
                <ul className="divide-y divide-gray-200">
                  {payment.allocations.map((allocation) => (
                    <li
                      key={allocation.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/finance/invoices/$invoiceId"
                          params={{ invoiceId: allocation.invoice_id }}
                          className="text-sm tabular text-accent-500 hover:underline"
                        >
                          {allocation.invoice.invoice_number}
                        </Link>
                        <p className="mt-0.5 text-2xs text-gray-600">
                          Applied {formatDate(allocation.allocated_at)}
                        </p>
                      </div>
                      <InvoiceStatusPill status={allocation.invoice.status} />
                      <Money
                        minor={allocation.amount_minor}
                        currency={payment.currency}
                        emphasis
                        className="w-32 text-right"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {(refunds.data ?? []).length > 0 && (
            <Card>
              <CardHeader title="Refunds" subtitle="Money returned to the payer." />
              <CardBody className="p-0">
                <ul className="divide-y divide-gray-200">
                  {(refunds.data ?? []).map((refund) => (
                    <li key={refund.id} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">{refund.reason ?? 'No reason given'}</p>
                        {refund.created_at && (
                          <p className="mt-0.5 text-2xs text-gray-600">
                            {formatDateTime(refund.created_at)}
                          </p>
                        )}
                      </div>
                      <Money
                        minor={refund.amount_minor}
                        currency={refund.currency ?? payment.currency}
                        emphasis
                      />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <DetailPanel>
          <DetailSection title="Amount">
            <Facts>
              <Fact label="Received">
                <Money minor={payment.amount_minor} currency={payment.currency} emphasis />
              </Fact>
              <Fact label="Applied">
                <Money
                  minor={payment.amount_minor - payment.unallocated_minor}
                  currency={payment.currency}
                />
              </Fact>
              <Fact label="Unapplied">
                <Money
                  minor={payment.unallocated_minor}
                  currency={payment.currency}
                  emphasis={payment.unallocated_minor > 0}
                  muted={payment.unallocated_minor === 0}
                />
              </Fact>
            </Facts>
          </DetailSection>

          <DetailSection title="Details">
            <Facts>
              <Fact label={t('learner')}>
                <Link
                  to="/students/$studentId"
                  params={{ studentId: payment.student_id }}
                  className="text-accent-500 hover:underline"
                >
                  {payment.student.name}
                </Link>
              </Fact>
              <Fact label="Method">{methodLabel(payment.method)}</Fact>
              <Fact label="Status">
                <PaymentStatusPill status={payment.status} />
              </Fact>
              <Fact label="Received on">
                {payment.paid_at ? formatDate(payment.paid_at) : '—'}
              </Fact>
              <Fact label="Confirmed">
                {payment.confirmed_at ? formatDateTime(payment.confirmed_at) : 'Not confirmed'}
              </Fact>
              <Fact label="Bank reference">
                {payment.external_reference ? (
                  <span className="tabular">{payment.external_reference}</span>
                ) : (
                  <span className="text-gray-500">None</span>
                )}
              </Fact>
              <Fact label="Currency">{payment.currency}</Fact>
            </Facts>
          </DetailSection>

          {canManage && live && (
            <DetailSection title="Correcting this" defaultOpen={false}>
              <p className="text-xs text-gray-700">
                A <strong className="font-medium text-gray-900">refund</strong> records money going
                back to the payer. A <strong className="font-medium text-gray-900">reversal</strong>{' '}
                says the payment should never have been recorded — its allocations are undone and
                the balances it settled go back up.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  fullWidth
                  disabled={refundsUnavailable}
                  onClick={() => setRefunding(true)}
                >
                  Refund
                </Button>
                <Button size="sm" fullWidth onClick={() => setReversing(true)}>
                  Reverse
                </Button>
              </div>
              {refundsUnavailable && (
                <p className="mt-2 text-2xs text-gray-600">
                  Refunds are unavailable on this deployment — the API&rsquo;s
                  <code className="mx-1 rounded bg-gray-100 px-1">payment_refunds</code>
                  table is missing a migration. Reversal still works.
                </p>
              )}
            </DetailSection>
          )}
        </DetailPanel>
      </div>

      <AllocatePaymentDialog
        payment={payment}
        open={allocating}
        onClose={() => setAllocating(false)}
      />
      <RefundDialog payment={payment} open={refunding} onClose={() => setRefunding(false)} />
      <ReversePaymentDialog
        payment={payment}
        open={reversing}
        onClose={() => setReversing(false)}
      />
    </PageStack>
  )
}

function Back() {
  return (
    <Link
      to="/finance"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={16} weight="bold" />
      Finance
    </Link>
  )
}
