import { command, get, getPage, post } from '@/shared/api/client'
import type { Paginated } from '@/shared/api/envelope'
import type {
  AllocatePaymentPayload,
  AssignStructurePayload,
  AwardScholarshipPayload,
  FeeCategory,
  FeeItemPayload,
  FeeStructure,
  FeeStructurePayload,
  FinanceSummary,
  GenerateInvoicePayload,
  Invoice,
  Payment,
  PaymentPlan,
  PaymentPlanPayload,
  RecordPaymentPayload,
  Refund,
  ScholarshipAward,
  StudentBalance,
} from './finance.types'

export const financeKeys = {
  all: ['finance'] as const,
  summary: (params?: unknown) => ['finance', 'summary', params] as const,
  invoices: (params?: unknown) => ['finance', 'invoices', params] as const,
  invoice: (id: string) => ['finance', 'invoice', id] as const,
  payments: (params?: unknown) => ['finance', 'payments', params] as const,
  payment: (id: string) => ['finance', 'payment', id] as const,
  refunds: (paymentId: string) => ['finance', 'refunds', paymentId] as const,
  structures: (params?: unknown) => ['finance', 'structures', params] as const,
  structure: (id: string) => ['finance', 'structure', id] as const,
  plans: (params?: unknown) => ['finance', 'plans', params] as const,
  awards: (params?: unknown) => ['finance', 'awards', params] as const,
  balance: (studentId: string) => ['finance', 'balance', studentId] as const,
  categories: () => ['finance', 'fee-categories'] as const,
  scholarships: () => ['finance', 'scholarships'] as const,
} as const

export interface InvoiceQuery {
  student_id?: string
  academic_session_id?: string
  status?: string
  /** A boolean the API reads with `->boolean()`, so send it only when true —
   *  `outstanding=false` and an absent key are the same request, and sending
   *  the string "false" would be read as true. */
  outstanding?: boolean
  page?: number
  per_page?: number
}

export interface PaymentQuery {
  student_id?: string
  status?: string
  page?: number
  per_page?: number
}

export const financeApi = {
  /** `granularity` is `day` or `month` here. NOT `daily`/`monthly` — those are
   *  the dashboard metric endpoint's spelling and this one 422s on them. */
  summary: (params: { from?: string; to?: string; granularity?: 'day' | 'month' }) =>
    get<FinanceSummary>('/admin/finance/summary', { params }),

  invoices: (params: InvoiceQuery): Promise<Paginated<Invoice>> =>
    getPage<Invoice>('/admin/finance/invoices', { params: prune(params) }),

  invoice: (id: string) => get<Invoice>(`/admin/finance/invoices/${id}`),

  /** Builds an invoice from the fee structure assigned to that learner for
   *  that session. It does not take lines — the structure is the source. */
  generateInvoice: (payload: GenerateInvoicePayload) =>
    post<Invoice>('/admin/finance/invoices', payload),

  issueInvoice: (id: string) => post<Invoice>(`/admin/finance/invoices/${id}/issue`),

  voidInvoice: (id: string, reason: string) =>
    post<Invoice>(`/admin/finance/invoices/${id}/void`, { reason }),

  createPaymentPlan: (invoiceId: string, payload: PaymentPlanPayload) =>
    post<PaymentPlan>(`/admin/finance/invoices/${invoiceId}/payment-plans`, payload),

  payments: (params: PaymentQuery): Promise<Paginated<Payment>> =>
    getPage<Payment>('/admin/finance/payments', { params: prune(params) }),

  payment: (id: string) => get<Payment>(`/admin/finance/payments/${id}`),

  recordPayment: (payload: RecordPaymentPayload) =>
    post<Payment>('/admin/finance/payments', payload),

  /** Applies received money to invoices. Omitting `amount_minor` on an entry
   *  lets the API settle as much of that invoice as the credit covers. */
  allocate: (paymentId: string, payload: AllocatePaymentPayload) =>
    post<Payment>(`/admin/finance/payments/${paymentId}/allocations`, payload),

  refunds: (paymentId: string) => get<Refund[]>(`/admin/finance/payments/${paymentId}/refunds`),

  refund: (paymentId: string, payload: { amount_minor?: number; reason: string }) =>
    post<Refund>(`/admin/finance/payments/${paymentId}/refunds`, payload),

  /** Undoes the whole payment. A refund returns money; a reversal says the
   *  payment should never have been recorded. */
  reverse: (paymentId: string, reason: string) =>
    post<Payment>(`/admin/finance/payments/${paymentId}/reverse`, { reason }),

  structures: (params?: { page?: number; per_page?: number }): Promise<Paginated<FeeStructure>> =>
    getPage<FeeStructure>('/admin/finance/fee-structures', { params }),

  structure: (id: string) => get<FeeStructure>(`/admin/finance/fee-structures/${id}`),

  createStructure: (payload: FeeStructurePayload) =>
    post<FeeStructure>('/admin/finance/fee-structures', payload),

  addItem: (structureId: string, payload: FeeItemPayload) =>
    post<FeeStructure>(`/admin/finance/fee-structures/${structureId}/items`, payload),

  /** One of `student_id`, `program_id` or `academic_level_id` — and
   *  `program_id`/`academic_level_id` are PROHIBITED alongside `student_id`. */
  assignStructure: (structureId: string, payload: AssignStructurePayload) =>
    command(`/admin/finance/fee-structures/${structureId}/assignments`, payload),

  plans: (params?: { page?: number; per_page?: number }): Promise<Paginated<PaymentPlan>> =>
    getPage<PaymentPlan>('/admin/finance/payment-plans', { params }),

  awards: (params?: { page?: number; per_page?: number }): Promise<Paginated<ScholarshipAward>> =>
    getPage<ScholarshipAward>('/admin/finance/scholarship-awards', { params }),

  award: (payload: AwardScholarshipPayload) =>
    post<ScholarshipAward>('/admin/finance/scholarship-awards', payload),

  revokeAward: (awardId: string, reason: string) =>
    post<ScholarshipAward>(`/admin/finance/scholarship-awards/${awardId}/revoke`, { reason }),

  balance: (studentId: string) =>
    get<StudentBalance>(`/admin/finance/students/${studentId}/balance`),

  feeCategories: () => get<FeeCategory[]>('/admin/catalog/fee-categories'),

  scholarships: () => get<{ id: string; name: string; code?: string }[]>('/admin/catalog/scholarships'),
}

/** Drop empty filters. `status=""` is not the same request as an absent
 *  `status` — the API would filter on an empty status and return nothing. */
function prune<T extends object>(params: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === '' || value === null || value === undefined || value === false) continue
    out[key] = value
  }
  return out as Partial<T>
}

/* ── Money at the edges ────────────────────────────────────────────────────*/

/**
 * How many minor units make one major unit of a currency.
 *
 * Two for NGN, USD and most others; none for JPY; three for KWD. Derived from
 * `Intl` rather than hard-coded, so a school billing in yen does not have its
 * fees multiplied by a hundred.
 */
export function minorUnitScale(currency: string, locale = 'en-NG'): number {
  try {
    const digits = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits
    return 10 ** (digits ?? 2)
  } catch {
    return 100
  }
}

/** A major-unit string from a form to the integer the API wants. */
export function toMinor(major: string | number, currency: string): number {
  const value = typeof major === 'number' ? major : Number(major)
  if (!Number.isFinite(value)) return 0
  return Math.round(value * minorUnitScale(currency))
}

/** The integer the API gave us, as a major-unit number for an input's value. */
export function toMajor(minor: number | null | undefined, currency: string): number {
  if (minor === null || minor === undefined) return 0
  return minor / minorUnitScale(currency)
}
