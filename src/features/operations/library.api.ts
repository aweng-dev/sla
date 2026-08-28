import { get, getPage, patch, post } from '@/shared/api/client'
import type { Paginated } from '@/shared/api/envelope'

/**
 * The library, from the circulation desk.
 *
 * ── Why a loan is not a row you edit ───────────────────────────────────────
 *
 * Issuing, returning and renewing are POSTs to their own addresses, and none of
 * them is a PATCH that sets a status. Each does more than change a word: a
 * return computes the overdue days and may raise a fine, a renewal moves the due
 * date against a renewal ceiling, and a sweep assesses every loan past its date
 * at once. A form that PATCHed `status: returned` would skip all of it and leave
 * the fines table disagreeing with the loans table.
 *
 * ── The fine is the reason `bill` is separate from `waive` ─────────────────
 *
 * A fine starts `outstanding` — assessed but not charged. Billing it raises a
 * charge on a family's account through the finance module, which is why it takes
 * an academic session and why it is a different act from writing the fine off.
 * Neither is reversible from this screen, and the API offers no un-bill.
 *
 * Shapes transcribed from the resources, not guessed.
 */

export type LoanStatus = 'active' | 'overdue' | 'returned' | 'lost'
export type FineStatus = 'outstanding' | 'billed' | 'waived'
export type MemberStatus = 'active' | 'suspended' | 'expired' | 'closed'

export interface LibraryTitle {
  id: string
  campus_id: string | null
  title: string
  subtitle: string | null
  author: string | null
  publisher: string | null
  isbn: string | null
  edition: string | null
  published_year: number | null
  language: string | null
  classification: string | null
  category: string | null
  description: string | null
  /** Absent unless the endpoint loaded them. */
  copies?: LibraryCopy[]
  available_copy_count?: number
}

export interface LibraryCopy {
  id: string
  library_title_id: string
  campus_id: string | null
  barcode: string
  status: string
  is_issuable: boolean
  condition: string | null
  shelf_location: string | null
  acquired_on: string | null
  acquisition_cost_minor: number | null
  currency: string | null
  title?: { id: string; title: string } | null
}

export interface LibraryMember {
  id: string
  person_id: string | null
  student_id: string | null
  staff_id: string | null
  campus_id: string | null
  member_number: string
  status: MemberStatus
  may_borrow: boolean
  loan_ceiling: number
  joined_on: string | null
  expires_on: string | null
  suspension_reason: string | null
  person?: { id: string; name: string } | null
  student?: { id: string; name: string } | null
}

export interface LibraryLoan {
  id: string
  library_copy_id: string
  library_member_id: string
  status: LoanStatus
  is_outstanding: boolean
  loaned_at: string | null
  due_at: string | null
  original_due_at: string | null
  returned_at: string | null
  renewal_count: number
  /** The API's own count, not one this client derives from `due_at` — the two
   *  would disagree the moment a grace period changed. */
  days_overdue: number
  return_condition: string | null
  copy?: LibraryCopy | null
  member?: LibraryMember | null
  fines?: LibraryFine[]
}

export interface LibraryFine {
  id: string
  library_loan_id: string | null
  library_member_id: string
  reason: string | null
  status: FineStatus
  is_open: boolean
  amount_minor: number
  currency: string
  days_overdue: number
  assessed_at: string | null
  billed_at: string | null
  invoice_id: string | null
  waived_at: string | null
  waiver_reason: string | null
}

/** What an overdue sweep did. Reported rather than assumed — a sweep that
 *  found nothing is a useful answer and must not read as a failure. */
export interface SweepResult {
  loans_marked_overdue?: number
  fines_assessed?: number
  [key: string]: unknown
}

export interface IssueLoanInput {
  /** One or the other. The barcode is what a desk actually scans. */
  library_copy_id?: string
  barcode?: string
  library_member_id: string
  loan_days?: number
  max_renewals?: number
}

export const libraryApi = {
  titles: (params: { search?: string; category?: string; available?: boolean; page?: number }) =>
    getPage<LibraryTitle>('/admin/library/titles', {
      params: {
        search: params.search || undefined,
        category: params.category || undefined,
        available: params.available ? 1 : undefined,
        page: params.page,
      },
    }),

  title: (id: string) => get<LibraryTitle>(`/admin/library/titles/${id}`),

  createTitle: (input: Partial<LibraryTitle>) =>
    post<LibraryTitle>('/admin/library/titles', input),

  updateTitle: (id: string, input: Partial<LibraryTitle>) =>
    patch<LibraryTitle>(`/admin/library/titles/${id}`, input),

  addCopy: (titleId: string, input: { barcode: string; shelf_location?: string }) =>
    post<LibraryCopy>(`/admin/library/titles/${titleId}/copies`, input),

  copies: (params: { page?: number }) =>
    getPage<LibraryCopy>('/admin/library/copies', { params }),

  withdrawCopy: (copyId: string, reason?: string) =>
    post<LibraryCopy>(`/admin/library/copies/${copyId}/withdraw`, { reason }),

  members: (params: { status?: MemberStatus | ''; member_number?: string; page?: number }) =>
    getPage<LibraryMember>('/admin/library/members', {
      params: {
        status: params.status || undefined,
        member_number: params.member_number || undefined,
        page: params.page,
      },
    }),

  suspendMember: (id: string, reason: string) =>
    post<LibraryMember>(`/admin/library/members/${id}/suspend`, { reason }),

  reinstateMember: (id: string) =>
    post<LibraryMember>(`/admin/library/members/${id}/reinstate`),

  loans: (params: {
    status?: LoanStatus | ''
    outstanding?: boolean
    overdue?: boolean
    library_member_id?: string
    page?: number
  }): Promise<Paginated<LibraryLoan>> =>
    getPage<LibraryLoan>('/admin/library/loans', {
      params: {
        status: params.status || undefined,
        outstanding: params.outstanding ? 1 : undefined,
        overdue: params.overdue ? 1 : undefined,
        library_member_id: params.library_member_id || undefined,
        page: params.page,
      },
    }),

  issueLoan: (input: IssueLoanInput) => post<LibraryLoan>('/admin/library/loans', input),

  returnLoan: (id: string, input: { condition?: string }) =>
    post<LibraryLoan>(`/admin/library/loans/${id}/return`, input),

  renewLoan: (id: string, input?: { loan_days?: number }) =>
    post<LibraryLoan>(`/admin/library/loans/${id}/renew`, input),

  /** Assesses every loan past its due date in one pass. Not a per-row action —
   *  it is the thing a librarian runs at the start of a day. */
  sweep: () => post<SweepResult>('/admin/library/loans/overdue-sweep'),

  fines: (params: { status?: FineStatus | ''; outstanding?: boolean; page?: number }) =>
    getPage<LibraryFine>('/admin/library/fines', {
      params: {
        status: params.status || undefined,
        outstanding: params.outstanding ? 1 : undefined,
        page: params.page,
      },
    }),

  /** Raises the charge on the family's account. Needs the session it belongs
   *  to, because that is what an invoice hangs off. */
  billFine: (id: string, academicSessionId: string) =>
    post<LibraryFine>(`/admin/library/fines/${id}/bill`, {
      academic_session_id: academicSessionId,
    }),

  waiveFine: (id: string, reason: string) =>
    post<LibraryFine>(`/admin/library/fines/${id}/waive`, { reason }),
}

export const libraryKeys = {
  root: ['admin', 'library'] as const,
  titles: (params: unknown) => ['admin', 'library', 'titles', params] as const,
  members: (params: unknown) => ['admin', 'library', 'members', params] as const,
  loans: (params: unknown) => ['admin', 'library', 'loans', params] as const,
  fines: (params: unknown) => ['admin', 'library', 'fines', params] as const,
}
