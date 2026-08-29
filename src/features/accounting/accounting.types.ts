/**
 * The institution's books, as `GET /admin/accounting/*` sends them.
 *
 * ── Every figure is in MINOR units ─────────────────────────────────────────
 *
 * `_minor` throughout: kobo, cents. Nothing here divides by 100 by hand —
 * `formatMoney` knows that not every currency has two decimal places.
 *
 * ── `normal_balance` is load-bearing ───────────────────────────────────────
 *
 * It names the side that INCREASES the account. Without it, a pair of debit
 * and credit totals cannot be turned into a balance: an asset with 500 debit
 * and 200 credit holds 300, while a liability with the same pair owes 300 and
 * must not be shown as −300. The API resolves `balance_minor` for that reason,
 * so no client has to know the sign convention.
 */

export const LEDGER_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number]

export type LedgerSide = 'debit' | 'credit'

export interface LedgerAccount {
  id: string
  code: string
  name: string
  type: LedgerAccountType
  /** The side that increases this account. */
  normal_balance: LedgerSide
  parent_account_id: string | null
  currency: string
  status: string
  description: string | null
  /** Null when the endpoint did not ask for totals — distinct from zero, which
   *  means "nothing has been posted here". */
  debit_minor: number | null
  credit_minor: number | null
  balance_minor: number | null
  created_at: string | null
}

export interface JournalLine {
  id: string
  account_code: string
  account_name: string
  side: LedgerSide
  amount_minor: number
  currency: string
  memo: string | null
  sequence: number
}

/**
 * One posting.
 *
 * `lines` is sent only by the detail endpoint — a list of twenty-five entries
 * would otherwise carry several hundred rows to render a date and a total.
 * `is_balanced` is the API's own comparison of the two totals, which is the one
 * thing a reader is checking; comparing them in the client risks doing it in
 * floating point, and a ledger that says "balanced" because 0.1 + 0.2 was close
 * enough is the exact failure double-entry exists to prevent.
 */
export interface JournalEntry {
  id: string
  entry_number: string
  entry_date: string | null
  source_type: string | null
  source_id: string | null
  currency: string
  status: string
  description: string
  total_debit_minor: number
  total_credit_minor: number
  is_balanced: boolean
  posted_at: string | null
  posted_by_staff_id: string | null
  lines?: JournalLine[]
}

export interface TrialBalance {
  accounts: LedgerAccount[]
  total_debit_minor: number
  total_credit_minor: number
  is_balanced: boolean
  from: string | null
  to: string | null
}

/** Which side a positive balance sits on, for the trial-balance columns. */
export function balanceColumn(account: LedgerAccount): LedgerSide {
  return account.normal_balance
}
