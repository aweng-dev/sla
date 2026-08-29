/**
 * The finance domain, transcribed from live responses.
 *
 * ── Money is in MINOR units, everywhere, without exception ─────────────────
 *
 * `total_minor`, `balance_minor`, `amount_minor` are integers in the
 * currency's smallest unit. Nothing in this feature divides by 100 by hand:
 * reads go through `formatMoney`, and writes go through `MoneyInput`, which
 * knows that not every currency has two decimal places. A float here is a
 * rounding error in somebody's school fees.
 *
 * ── The three nouns and how they relate ────────────────────────────────────
 *
 *   FEE STRUCTURE  what a place costs — a named set of items for a session,
 *                  assignable to a student, a programme or a year group.
 *   INVOICE        what one learner has been charged, generated from the
 *                  structure assigned to them. Has lines, a status and a
 *                  balance.
 *   PAYMENT        money received. It is NOT tied to one invoice: a payment
 *                  carries ALLOCATIONS against invoices, and whatever is not
 *                  allocated sits as credit (`unallocated_minor`).
 *
 * That last point is the one that shapes the screens. A parent pays a round
 * sum; the bursar decides which invoices it settles.
 */

export type InvoiceStatus = 'draft' | 'issued' | 'part_paid' | 'paid' | 'void'
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'reversed'
export type PaymentMethod = 'cash' | 'bank' | 'card' | 'online' | 'waiver'

export interface StudentRef {
  id: string
  student_number: string
  name: string
  has_photo: boolean
}

export interface InvoiceLine {
  id: string
  fee_item_id: string | null
  fee_category_id: string | null
  description: string
  quantity: number
  unit_amount_minor: number
  amount_minor: number
  sequence: number
}

export interface Invoice {
  id: string
  student_id: string
  academic_session_id: string
  academic_period_id: string | null
  invoice_number: string
  status: InvoiceStatus
  /** How it came to exist — `assignments` for one generated from an assigned
   *  fee structure. Not a status; do not render it as one. */
  origin: string
  currency: string
  subtotal_minor: number
  discount_minor: number
  total_minor: number
  paid_minor: number
  balance_minor: number
  /** Frozen invoices cannot be edited. Paid and void ones are frozen. */
  is_frozen: boolean
  /** Whether a payment can still be applied to it. A paid invoice is not. */
  is_settleable: boolean
  issued_at: string | null
  due_on: string | null
  voided_at: string | null
  void_reason: string | null
  /** Present on the detail response only. */
  lines?: InvoiceLine[]
  student: StudentRef
}

export interface PaymentAllocation {
  id: string
  payment_id: string
  invoice_id: string
  amount_minor: number
  allocated_at: string
  invoice: { id: string; invoice_number: string; status: InvoiceStatus }
}

export interface Payment {
  id: string
  student_id: string
  /** The invoice named when the payment was recorded, if any. The authoritative
   *  record of what it settled is `allocations`, not this. */
  invoice_id: string | null
  reference: string
  method: PaymentMethod
  status: PaymentStatus
  amount_minor: number
  /** Received but not yet applied to an invoice — the learner's credit. */
  unallocated_minor: number
  currency: string
  paid_at: string | null
  confirmed_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
  external_reference: string | null
  allocations: PaymentAllocation[]
  student: StudentRef
}

export interface Refund {
  id: string
  payment_id: string
  amount_minor: number
  currency?: string
  reason: string | null
  created_at?: string
  [key: string]: unknown
}

export interface FeeItem {
  id: string
  fee_structure_id: string
  fee_category_id: string
  name: string
  amount_minor: number
  /** Optional items are excluded from `total_minor` and included in
   *  `total_with_optional_minor` — a bus fare a family may decline. */
  is_optional: boolean
  is_refundable: boolean
  due_offset_days: number | null
  sequence: number
}

export interface FeeStructure {
  id: string
  academic_session_id: string
  academic_period_id: string | null
  program_id: string | null
  academic_level_id: string | null
  name: string
  code: string
  status: string
  is_assignable: boolean
  currency: string
  total_minor: number
  total_with_optional_minor: number
  items: FeeItem[]
}

export interface FeeCategory {
  id: string
  name: string
  code: string
  kind: string
  is_recurring: boolean
  status: string
}

export interface ScholarshipAward {
  id: string
  scholarship_id: string
  student_id: string
  academic_session_id: string
  amount_minor: number | null
  reason: string | null
  status?: string
  revoked_at?: string | null
  student?: StudentRef
  [key: string]: unknown
}

export interface PaymentPlan {
  id: string
  invoice_id: string
  installment_count: number
  status?: string
  [key: string]: unknown
}

export interface StudentBalance {
  student_id: string
  currency: string
  invoiced_minor: number
  discount_minor: number
  paid_minor: number
  balance_minor: number
  unallocated_minor: number
  overdue_minor: number
  invoice_count: number
  is_settled: boolean
  outstanding_invoice_ids: string[]
}

export interface FinanceSummary {
  currency: string
  granularity: string
  from: string
  to: string
  totals: {
    payment_count: number
    charged_minor: number
    bursaries_minor: number
    write_offs_minor: number
    collected_minor: number
  }
  periods: {
    period: string
    payment_count: number
    charged_minor: number
    bursaries_minor: number
    write_offs_minor: number
    collected_minor: number
  }[]
}

/* ── Payloads ──────────────────────────────────────────────────────────────*/

export interface GenerateInvoicePayload {
  student_id: string
  academic_session_id: string
  academic_period_id?: string | null
  due_on?: string | null
}

export interface RecordPaymentPayload {
  student_id: string
  invoice_id?: string | null
  reference?: string | null
  method: PaymentMethod
  amount_minor: number
  currency?: string
  paid_at?: string | null
  external_reference?: string | null
  notes?: string | null
  /** Unconfirmed payments sit as `pending` and do not reduce a balance. */
  confirmed?: boolean
}

export interface AllocatePaymentPayload {
  allocations: { invoice_id: string; amount_minor?: number }[]
}

export interface PaymentPlanPayload {
  installment_count: number
  first_due_on?: string | null
  interval_months?: number | null
  notes?: string | null
}

export interface FeeStructurePayload {
  academic_session_id: string
  academic_period_id?: string | null
  program_id?: string | null
  academic_level_id?: string | null
  name: string
  code: string
  status?: string
  currency?: string
  description?: string | null
}

export interface FeeItemPayload {
  fee_category_id: string
  name?: string | null
  amount_minor: number
  is_optional?: boolean
  is_refundable?: boolean
  due_offset_days?: number | null
  sequence?: number | null
  description?: string | null
}

export interface AssignStructurePayload {
  student_id?: string | null
  program_id?: string | null
  academic_level_id?: string | null
  academic_period_id?: string | null
  optional_fee_item_ids?: string[]
}

export interface AwardScholarshipPayload {
  scholarship_id: string
  student_id: string
  academic_session_id: string
  amount_minor?: number | null
  reason?: string | null
}

/**
 * A gateway's own message about a payment.
 *
 * ── Why a bursar ever looks at these ───────────────────────────────────────
 *
 * The money loop is: structure → invoice → checkout → the provider takes the
 * money → a webhook says so → a payment is written → the balance falls. When a
 * parent says "I paid and it still shows unpaid", exactly one link in that
 * chain has broken, and this is the only screen that can say which.
 *
 * `status` is the API's `PaymentWebhookStatus`. `exhausted` and `failed` are
 * the two a person has to act on — the rest resolve themselves.
 */
export type PaymentWebhookStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed'
  | 'exhausted'

export interface PaymentWebhookEvent {
  id: string
  provider: string
  provider_label: string
  provider_event_id: string | null
  event_type: string | null
  status: PaymentWebhookStatus
  /** Nothing further will happen on its own. */
  is_terminal: boolean
  /**
   * Whether the message was really from the provider. A false here is not a
   * retry candidate — it is a message this application could not prove came
   * from the gateway, and replaying it would be acting on an unsigned claim
   * about somebody's money.
   */
  signature_verified: boolean
  /** The intent this refers to, when one could be matched. Null is the
   *  interesting case: a payment nothing in this system is waiting for. */
  intent_reference: string | null
  payment_intent_id: string | null
  attempts: number
  last_error: string | null
  next_attempt_at: string | null
  received_at: string | null
  processed_at: string | null
  /** The provider's raw body. Shown on demand, never parsed for meaning. */
  payload?: Record<string, unknown> | null
}
