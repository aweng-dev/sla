import { get, getPage, http } from '@/shared/api/client'
import type { ApiEnvelope, Paginated } from '@/shared/api/envelope'
import type { JournalEntry, LedgerAccount, TrialBalance } from './accounting.types'

/**
 * The institution's books.
 *
 * ── Read-only, and that is the design rather than a gap ────────────────────
 *
 * There is no write verb anywhere in this API group and this client offers
 * none. Journal entries are written by the Actions that CAUSE them — posting a
 * payroll run is the one that exists today — from inside the transaction of the
 * thing being posted, so an entry can never describe a run that rolled back.
 *
 * A posted entry is corrected by REVERSING it, never by editing it. That is
 * what `reversed_by_entry_id` on the table is for, and why a screen offering
 * "edit" would offer something the ledger does not have.
 *
 * ── Its own module, deliberately ───────────────────────────────────────────
 *
 * `module:accounting` is not `module:finance`. An institution can run fees,
 * invoices and payments without keeping double-entry books, and gating the
 * ledger on the finance module would hand it to every one of them.
 *
 * ── Minor units throughout ─────────────────────────────────────────────────
 *
 * Every amount is an integer in the currency's smallest unit. Nothing here
 * divides by 100; `formatMoney` knows that not every currency has two decimal
 * places.
 */

/** What the chart listing is narrowed by. */
export interface AccountQuery {
  search?: string
  /**
   * A `LedgerAccountType`, or empty for all of them.
   *
   * Typed as a plain string rather than the union: the API validates it against
   * its own enum and answers 422 on anything else, so the server owns the
   * vocabulary. Narrowing it here would only mean a caller holding a `<select>`
   * value has to cast on the way in.
   */
  type?: string
  status?: string
  page?: number
  per_page?: number
}

/** What the journal listing is narrowed by. `from`/`to` are dates on the
 *  ENTRY, not on when it was posted — a run posted late still belongs to the
 *  period it covers. */
export interface JournalQuery {
  search?: string
  status?: string
  source_type?: string
  source_id?: string
  from?: string
  to?: string
  page?: number
  per_page?: number
}

/** The window a trial balance is drawn for. Both open by default, which is the
 *  ledger since it began. */
export interface TrialBalanceQuery {
  from?: string
  to?: string
}

const ROOT = '/admin/accounting'

export const accountingApi = {
  /**
   * The trial balance for a period.
   *
   * Accounts nothing has been posted to are excluded server-side — an untouched
   * account is a line in the chart, not part of a trial balance. It answers with
   * a bare `data` object rather than a paginated list, so this reads the
   * envelope directly rather than pretending it is a page.
   */
  async trialBalance(query: TrialBalanceQuery = {}): Promise<TrialBalance> {
    const response = await http.get<ApiEnvelope<TrialBalance>>(
      `${ROOT}/ledger-accounts/trial-balance`,
      { params: { from: query.from || undefined, to: query.to || undefined } },
    )

    return response.data.data
  },

  accounts: (query: AccountQuery = {}): Promise<Paginated<LedgerAccount>> =>
    getPage<LedgerAccount>(`${ROOT}/ledger-accounts`, {
      params: {
        search: query.search || undefined,
        type: query.type || undefined,
        status: query.status || undefined,
        page: query.page,
        per_page: query.per_page,
      },
    }),

  account: (id: string) => get<LedgerAccount>(`${ROOT}/ledger-accounts/${id}`),

  entries: (query: JournalQuery = {}): Promise<Paginated<JournalEntry>> =>
    getPage<JournalEntry>(`${ROOT}/journal-entries`, {
      params: {
        search: query.search || undefined,
        status: query.status || undefined,
        source_type: query.source_type || undefined,
        source_id: query.source_id || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        page: query.page,
        per_page: query.per_page,
      },
    }),

  /** One entry with its lines. The lines are the entry — an entry without them
   *  is a total with nothing to explain it. */
  entry: (id: string) => get<JournalEntry>(`${ROOT}/journal-entries/${id}`),
}

export const accountingKeys = {
  root: ['admin', 'accounting'] as const,
  trialBalance: (query?: unknown) => ['admin', 'accounting', 'trial-balance', query] as const,
  accounts: (query?: unknown) => ['admin', 'accounting', 'accounts', query] as const,
  account: (id: string) => ['admin', 'accounting', 'account', id] as const,
  entries: (query?: unknown) => ['admin', 'accounting', 'entries', query] as const,
  entry: (id: string) => ['admin', 'accounting', 'entry', id] as const,
}
