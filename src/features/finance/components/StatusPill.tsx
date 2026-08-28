import { Badge } from '@/shared/ui'
import type { InvoiceStatus, PaymentStatus } from '../finance.types'

/**
 * Invoice and payment states, named as a bursar names them.
 *
 * The API's `part_paid` and `issued` are accurate and unidiomatic; "Part paid"
 * and "Awaiting payment" are what the words mean on a ledger. `void` is a
 * different kind of thing from the rest — the invoice did not happen — so it
 * is the only one drawn quietly rather than in a status colour.
 */
const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Awaiting payment',
  part_paid: 'Part paid',
  paid: 'Paid',
  void: 'Void',
}

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  const label = INVOICE_LABELS[status] ?? status

  if (status === 'paid') return <Badge tone="success">{label}</Badge>
  if (status === 'part_paid') return <Badge tone="warning">{label}</Badge>
  if (status === 'issued') return <Badge tone="accent">{label}</Badge>
  if (status === 'void') return <Badge tone="outline">{label}</Badge>
  return <Badge tone="neutral">{label}</Badge>
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Unconfirmed',
  confirmed: 'Confirmed',
  failed: 'Failed',
  reversed: 'Reversed',
}

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  const label = PAYMENT_LABELS[status] ?? status

  if (status === 'confirmed') return <Badge tone="success">{label}</Badge>
  if (status === 'pending') return <Badge tone="warning">{label}</Badge>
  if (status === 'failed') return <Badge tone="danger">{label}</Badge>
  return <Badge tone="outline">{label}</Badge>
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank transfer',
  card: 'Card',
  online: 'Online',
  /** Not money. A waiver records that a charge was forgiven, which is why it
   *  reduces a balance without a payment ever arriving. */
  waiver: 'Waiver',
}

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method
}
