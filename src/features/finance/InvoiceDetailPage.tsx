import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarDots, Plus, Prohibit, Receipt, Warning } from '@phosphor-icons/react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EntityIcon,
  ErrorState,
  MetaDot,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { formatDate, formatDateTime, humanize } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { financeApi, financeKeys } from './finance.api'
import { Money, PaidBar } from './components/money'
import { InvoiceStatusPill } from './components/StatusPill'
import { DetailPanel, DetailSection, Fact, Facts } from './components/DetailPanel'
import { PaymentPlanDialog, VoidInvoiceDialog } from './dialogs/InvoiceDialogs'
import { RecordPaymentDialog } from './dialogs/PaymentDialogs'
import { useFinanceMutation } from './dialogs/useFinanceMutation'

/**
 * One invoice.
 *
 * Laid out the way Sprig lays out a study: the thing itself on the left — its
 * lines and totals — and a narrow rail on the right holding the facts about it
 * and the actions available. The lines are what somebody came to read; the
 * session, origin and stamps are reference.
 */
export function InvoiceDetailPage() {
  const { invoiceId } = useParams({ strict: false }) as { invoiceId: string }
  const t = useTerminology()
  const perms = usePermissions()
  const [voiding, setVoiding] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [paying, setPaying] = useState(false)

  const query = useQuery({
    queryKey: financeKeys.invoice(invoiceId),
    queryFn: () => financeApi.invoice(invoiceId),
  })

  const issue = useFinanceMutation({
    mutationFn: () => financeApi.issueInvoice(invoiceId),
    success: 'Invoice issued',
  })

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

  const invoice = query.data
  const lines = invoice.lines ?? []
  const canManage = perms.has('finance.manage')

  return (
    <PageStack>
      <Back />

      <PageHeader
        icon={
          <EntityIcon>
            <Receipt size={17} />
          </EntityIcon>
        }
        title={invoice.invoice_number}
        meta={
          <>
            <Link
              to="/students/$studentId"
              params={{ studentId: invoice.student_id }}
              className="inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900"
            >
              <Avatar name={invoice.student.name} size="sm" />
              {invoice.student.name}
            </Link>
            <MetaDot />
            <InvoiceStatusPill status={invoice.status} />
            {invoice.issued_at && (
              <>
                <MetaDot />
                <span>Issued {formatDate(invoice.issued_at)}</span>
              </>
            )}
            {invoice.due_on && (
              <>
                <MetaDot />
                <span>Due {formatDate(invoice.due_on)}</span>
              </>
            )}
          </>
        }
        actions={
          canManage && (
            <>
              {invoice.status === 'draft' && (
                <Button loading={issue.isPending} onClick={() => issue.mutate(undefined)}>
                  Issue
                </Button>
              )}
              {invoice.status !== 'void' && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Void this invoice"
                  onClick={() => setVoiding(true)}
                >
                  <Prohibit size={15} />
                </Button>
              )}
              {invoice.is_settleable && (
                <Button
                  variant="primary"
                  trailing={<Plus size={16} weight="bold" />}
                  onClick={() => setPaying(true)}
                >
                  Record payment
                </Button>
              )}
            </>
          )
        }
      />

      {invoice.status === 'void' && (
        <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Warning size={16} className="mt-0.5 shrink-0 text-gray-600" />
          <div className="text-sm">
            <p className="font-medium text-gray-900">This invoice was voided</p>
            <p className="mt-0.5 text-gray-700">
              {invoice.void_reason ?? 'No reason was recorded.'}
              {invoice.voided_at && ` · ${formatDateTime(invoice.voided_at)}`}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Card>
            <CardHeader
              title="What is being charged"
              subtitle={`${lines.length} line${lines.length === 1 ? '' : 's'}`}
            />
            <CardBody className="p-0">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-table-head">
                    <th className="w-10 px-4 py-2 text-2xs font-medium text-gray-600">#</th>
                    <th className="px-3 py-2 text-2xs font-medium text-gray-600">Item</th>
                    <th className="w-20 px-3 py-2 text-right text-2xs font-medium text-gray-600">
                      Qty
                    </th>
                    <th className="w-32 px-3 py-2 text-right text-2xs font-medium text-gray-600">
                      Unit
                    </th>
                    <th className="w-32 px-4 py-2 text-right text-2xs font-medium text-gray-600">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-gray-200">
                      <td className="px-4 py-2 text-2xs tabular text-gray-500">{line.sequence}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{line.description}</td>
                      <td className="px-3 py-2 text-right text-sm tabular text-gray-700">
                        {line.quantity}
                      </td>
                      <td className="px-3 py-2 text-right text-sm">
                        <Money minor={line.unit_amount_minor} currency={invoice.currency} />
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        <Money minor={line.amount_minor} currency={invoice.currency} />
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-600">
                        This invoice has no lines.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <dl className="border-t border-gray-200 px-4 py-3">
                <Row label="Subtotal">
                  <Money minor={invoice.subtotal_minor} currency={invoice.currency} />
                </Row>
                {invoice.discount_minor > 0 && (
                  <Row label="Discount">
                    <Money
                      minor={-invoice.discount_minor}
                      currency={invoice.currency}
                      className="text-success-600"
                    />
                  </Row>
                )}
                <Row label="Total" strong>
                  <Money minor={invoice.total_minor} currency={invoice.currency} emphasis />
                </Row>
                <Row label="Paid">
                  <Money minor={invoice.paid_minor} currency={invoice.currency} />
                </Row>
                <Row label="Outstanding" strong>
                  <Money
                    minor={invoice.balance_minor}
                    currency={invoice.currency}
                    emphasis={invoice.balance_minor > 0}
                    muted={invoice.balance_minor === 0}
                  />
                </Row>
              </dl>
            </CardBody>
          </Card>
        </div>

        <DetailPanel>
          <DetailSection title="Progress">
            <PaidBar
              paid={invoice.paid_minor}
              total={invoice.total_minor}
              currency={invoice.currency}
            />
          </DetailSection>

          <DetailSection title="Details">
            <Facts>
              <Fact label={t('learner')}>
                <Link
                  to="/students/$studentId"
                  params={{ studentId: invoice.student_id }}
                  className="text-accent-500 hover:underline"
                >
                  {invoice.student.name}
                </Link>
              </Fact>
              <Fact label={`${t('learner')} no.`}>
                <span className="tabular">{invoice.student.student_number}</span>
              </Fact>
              <Fact label="Status">
                <InvoiceStatusPill status={invoice.status} />
              </Fact>
              <Fact label="Origin">{humanize(invoice.origin)}</Fact>
              <Fact label="Currency">{invoice.currency}</Fact>
              <Fact label="Issued">
                {invoice.issued_at ? formatDate(invoice.issued_at) : 'Not yet issued'}
              </Fact>
              <Fact label="Due">{invoice.due_on ? formatDate(invoice.due_on) : 'No due date'}</Fact>
              <Fact label="Editable">
                {invoice.is_frozen ? <Badge tone="outline">Frozen</Badge> : 'Yes'}
              </Fact>
            </Facts>
          </DetailSection>

          {canManage && invoice.is_settleable && (
            <DetailSection title="Options" defaultOpen={false}>
              <Button
                fullWidth
                icon={<CalendarDots size={14} />}
                onClick={() => setPlanning(true)}
              >
                Split into instalments
              </Button>
              <p className="mt-2 text-2xs text-gray-600">
                Divides the outstanding amount into equal instalments with their own due dates.
              </p>
            </DetailSection>
          )}
        </DetailPanel>
      </div>

      <VoidInvoiceDialog invoice={invoice} open={voiding} onClose={() => setVoiding(false)} />
      <PaymentPlanDialog invoice={invoice} open={planning} onClose={() => setPlanning(false)} />
      <RecordPaymentDialog
        open={paying}
        onClose={() => setPaying(false)}
        student={{ id: invoice.student_id, name: invoice.student.name }}
        invoiceId={invoice.id}
        suggestedMinor={invoice.balance_minor}
      />
    </PageStack>
  )
}

function Row({
  label,
  children,
  strong,
}: {
  label: string
  children: React.ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={strong ? 'text-sm font-semibold text-gray-900' : 'text-sm font-medium text-gray-600'}>
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
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
