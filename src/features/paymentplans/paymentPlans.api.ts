import { get, getPage, PER_PAGE_DEFAULT } from '@/shared/api/client'

/**
 * Payment plans: an invoice somebody is paying in instalments.
 *
 * ── Read-only here, and deliberately so ────────────────────────────────────
 *
 * A plan is CREATED against the invoice it settles —
 * `POST /admin/finance/invoices/{invoice}/payment-plans` — because a plan
 * without an invoice is not a thing, and the amount it schedules is the
 * invoice's own. So the create lives on the invoice screen, and this surface
 * is the list of what exists. Offering a create here would mean asking the
 * reader to pick an invoice from a dropdown of every unpaid bill in the
 * institution, which is the wrong way round.
 *
 * Its own directory rather than joining `features/finance`: `payment_plans` is
 * a separate module with its own rail item, and an institution can run
 * invoices and payments without offering instalments at all.
 */

export interface PaymentPlanInstallment {
  id: string
  installment_number: number
  /** Minor units — kobo, cents. Never divided by hand. */
  amount_minor: number
  paid_minor: number
  due_on: string | null
  status: string
}

export interface PaymentPlan {
  id: string
  reference: string | null
  invoice_id: string
  student_id: string | null
  status: string
  currency: string
  total_minor: number
  installment_count: number
  agreed_at: string | null
  /** Sent inline with the list, so a schedule needs no second request. */
  installments: PaymentPlanInstallment[]
}

export interface PaymentPlanQuery {
  invoice_id?: string
  student_id?: string
  status?: string
  page?: number
  per_page?: number
}

export const paymentPlansApi = {
  list: (query: PaymentPlanQuery) =>
    getPage<PaymentPlan>('/admin/finance/payment-plans', {
      params: { per_page: PER_PAGE_DEFAULT, ...query },
    }),

  detail: (planId: string) => get<PaymentPlan>(`/admin/finance/payment-plans/${planId}`),
}

export const paymentPlanKeys = {
  all: ['payment-plans'] as const,
  list: (params?: unknown) => ['payment-plans', 'list', params] as const,
  detail: (id: string) => ['payment-plans', 'detail', id] as const,
}

/** What is still owed on a plan. The API sends per-instalment figures rather
 *  than a total outstanding, and summing them here keeps the one place that
 *  knows the arithmetic next to the type that describes it. */
export function outstandingMinor(plan: PaymentPlan): number {
  return plan.installments.reduce(
    (total, installment) => total + Math.max(0, installment.amount_minor - installment.paid_minor),
    0,
  )
}

/** How many instalments are fully settled — the numerator of "3 of 6 paid". */
export function settledCount(plan: PaymentPlan): number {
  return plan.installments.filter((i) => i.paid_minor >= i.amount_minor).length
}
