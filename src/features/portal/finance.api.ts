import { get, http, post } from '@/shared/api/client'
import type { ApiEnvelope } from '@/shared/api/envelope'

/**
 * The bill, as the family it is for sees it — and paying it.
 *
 * ── Why this exists beside the bursar's client ─────────────────────────────
 *
 * `finance` lists `student_self` and `guardian_children` among its access
 * profiles, so the rail draws Student finance for a family. The staff screens
 * speak `/admin/finance/…`, which carries the `staff` middleware and answers
 * 403 to them. These are the endpoints the API has always had for the other
 * side.
 *
 * ── A family may START a payment and may never RECORD one ──────────────────
 *
 * There is no `POST /portal/finance/payments` and there must not be. Money is
 * written only by the settlement Action, after this application has asked the
 * provider directly — so nothing a parent can compose ever credits an account.
 * What they can do is open a checkout, which creates an INTENT: a 201 here is
 * not a claim that anything has been paid, and `is_settled` stays false until
 * the provider's webhook or an explicit verify says otherwise.
 *
 * ── `?student_id=` intersects, it never widens ─────────────────────────────
 *
 * A guardian with three children names one to narrow to them. An id that is not
 * their own record or a child they are AUTHORIZED for answers 404 — confirming
 * that a student id exists is itself a leak — so this client passes the
 * parameter through and never treats it as a way to reach anybody new.
 */

export interface FamilyBalance {
  student_id: string
  currency: string
  invoiced_minor: number
  discount_minor: number
  paid_minor: number
  /** What is still owed. The one number a family came to see. */
  balance_minor: number
  /** Money received but not yet applied to any invoice. */
  unallocated_minor: number
  overdue_minor: number
  invoice_count: number
  is_settled: boolean
  outstanding_invoice_ids: string[]
}

export interface FamilyInvoiceLine {
  id: string
  description: string | null
  quantity: number | null
  unit_amount_minor: number | null
  amount_minor: number
  discount_minor?: number | null
}

export interface FamilyInvoice {
  id: string
  student_id: string
  academic_session_id: string | null
  academic_period_id: string | null
  invoice_number: string
  status: string
  origin: string | null
  currency: string
  subtotal_minor: number
  discount_minor: number
  total_minor: number
  paid_minor: number
  balance_minor: number
  /** Frozen means no further change — voided, or settled and closed. */
  is_frozen: boolean
  /**
   * The server's answer to "can this be paid now". Never re-derived from a
   * balance and a status: a client that worked it out itself would offer a Pay
   * button that the checkout then refuses, which on a bill reads as the school
   * refusing money.
   */
  is_settleable: boolean
  issued_at: string | null
  due_on: string | null
  voided_at: string | null
  void_reason: string | null
  lines?: FamilyInvoiceLine[]
  student?: { id: string; name: string } | null
}

export interface FamilyPayment {
  id: string
  student_id: string
  invoice_id: string | null
  reference: string
  method: string
  status: string
  amount_minor: number
  unallocated_minor: number
  currency: string
  paid_at: string | null
  confirmed_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
}

export interface PaymentProviderOption {
  provider: string
  label: string
  currencies: string[]
  supports_partial_refunds: boolean
}

export interface PaymentIntent {
  id: string
  reference: string
  provider: string
  provider_label: string
  status: string
  /** False on a fresh intent. The money has not moved until this is true. */
  is_settled: boolean
  is_terminal: boolean
  amount_minor: number
  currency: string
  invoice_id: string | null
  student_id: string | null
  payment_id: string | null
  /** Where the payer is sent. Opened rather than fetched — it belongs to the
   *  provider, not to this application. */
  checkout_url: string | null
  failure_reason: string | null
  expires_at: string | null
  verified_at: string | null
  settled_at: string | null
  created_at: string | null
}

export const familyFinanceApi = {
  balance: (studentId?: string) =>
    get<FamilyBalance>('/portal/finance/balance', {
      params: { student_id: studentId || undefined },
    }),

  invoices: (studentId?: string) =>
    get<FamilyInvoice[]>('/portal/finance/invoices', {
      params: { student_id: studentId || undefined },
    }),

  invoice: (id: string) => get<FamilyInvoice>(`/portal/finance/invoices/${id}`),

  payments: (studentId?: string) =>
    get<FamilyPayment[]>('/portal/finance/payments', {
      params: { student_id: studentId || undefined },
    }),

  /**
   * Which gateways this institution can take money through, for this
   * invoice's currency.
   *
   * The balance travels in `meta` rather than `data`, because it describes the
   * invoice rather than any provider — so this reads both halves.
   */
  async providers(invoiceId: string): Promise<{
    providers: PaymentProviderOption[]
    currency: string | null
    balanceMinor: number | null
  }> {
    const response = await http.get<ApiEnvelope<PaymentProviderOption[]>>(
      `/portal/finance/invoices/${invoiceId}/payment-providers`,
    )

    const meta = response.data.meta as Record<string, unknown> | undefined

    return {
      providers: response.data.data ?? [],
      currency: typeof meta?.currency === 'string' ? meta.currency : null,
      balanceMinor: typeof meta?.balance_minor === 'number' ? meta.balance_minor : null,
    }
  },

  /**
   * Open a checkout.
   *
   * `amount_minor` is optional — omitted, the provider is asked for the whole
   * balance. The ceiling is enforced server-side against the invoice's live
   * balance, so a stale screen cannot start a checkout for more than is owed.
   */
  startCheckout: (
    invoiceId: string,
    input: { provider: string; amount_minor?: number; idempotency_key?: string },
  ) => post<PaymentIntent>(`/portal/finance/invoices/${invoiceId}/checkout`, input),

  intent: (reference: string) => get<PaymentIntent>(`/portal/finance/payment-intents/${reference}`),

  /** What the return page calls when the payer has just come back — asks the
   *  provider directly rather than trusting the redirect. */
  verify: (reference: string) =>
    post<PaymentIntent>(`/portal/finance/payment-intents/${reference}/verify`),
}

export const familyFinanceKeys = {
  root: ['portal', 'me', 'finance'] as const,
  balance: (studentId?: string) => ['portal', 'me', 'finance', 'balance', studentId ?? 'self'] as const,
  invoices: (studentId?: string) =>
    ['portal', 'me', 'finance', 'invoices', studentId ?? 'self'] as const,
  invoice: (id: string) => ['portal', 'me', 'finance', 'invoice', id] as const,
  payments: (studentId?: string) =>
    ['portal', 'me', 'finance', 'payments', studentId ?? 'self'] as const,
  providers: (invoiceId: string) => ['portal', 'me', 'finance', 'providers', invoiceId] as const,
  intent: (reference: string) => ['portal', 'me', 'finance', 'intent', reference] as const,
}
