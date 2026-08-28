import { command, get, getPage, http, post, put, PER_PAGE_DEFAULT } from '@/shared/api/client'
import type {
  LeaveEntitlement,
  LeaveRequest,
  LeaveType,
  PayrollPeriod,
  PayrollRun,
  Payslip,
  StaffPosition,
  StaffQualification,
  StaffRecord,
  StaffRow,
} from './hr.types'

/**
 * Staff, leave and payroll in one place, because they are one section of the
 * rail and every one of them is keyed on a staff id.
 *
 * ── Administrative only ────────────────────────────────────────────────────
 *
 * Every endpoint here answers 403 to a teacher — verified against the live
 * API for all twelve of them. So unlike students and guardians there is no
 * portal branch, and the screens do not need one.
 *
 * ── Two endpoints are gated on what KIND of institution this is ────────────
 *
 * `/admin/staff-assignments` refuses a school whose internal divisions are its
 * sections, with a domain 404 that says exactly that. The staff record
 * therefore reads assignments from its OWN payload, which carries them inline,
 * and the assignment management screen is only offered where
 * `institution.supports_organizational_units` is true.
 *
 * ── There is no way to CREATE a staff member here ──────────────────────────
 *
 * `/admin/staff` is GET only. A person becomes staff through People
 * Management, which owns the person record; this surface manages the
 * employment attached to one. The roster therefore has no "Add" button, and
 * that is the API's design rather than an omission.
 */

export interface StaffListQuery {
  search?: string
  status?: string
  position_id?: string
  campus_id?: string
  page?: number
  per_page?: number
}

export const staffApi = {
  list: (query: StaffListQuery) =>
    getPage<StaffRow>('/admin/staff', { params: { per_page: PER_PAGE_DEFAULT, ...query } }),

  /** Carries `assignments`, `assignment_count` and `course_offering_count`,
   *  which the list does not. */
  detail: (staffId: string) => get<StaffRecord>(`/admin/staff/${staffId}`),

  /** Bytes, never a URL — the same arrangement as a student photograph, and
   *  for the same reason. `person.has_photo` says whether to spend the call. */
  photo: async (staffId: string): Promise<Blob> => {
    const response = await http.get<Blob>(`/admin/staff/${staffId}/photo`, {
      responseType: 'blob',
    })
    return response.data
  },

  positions: () => get<StaffPosition[]>('/admin/staff-positions'),

  createPosition: (payload: { name: string; code: string; description?: string | null }) =>
    post<StaffPosition>('/admin/staff-positions', payload),

  updatePosition: (
    positionId: string,
    payload: { name?: string; description?: string | null; status?: string },
  ) => put<StaffPosition>(`/admin/staff-positions/${positionId}`, payload),

  qualifications: (staffId: string) =>
    getPage<StaffQualification>('/admin/staff-qualifications', {
      params: { staff_id: staffId, per_page: 50 },
    }),

  addQualification: (payload: {
    staff_id: string
    kind?: string
    title: string
    awarding_body?: string | null
    field_of_study?: string | null
    reference?: string | null
    awarded_on?: string | null
    expires_on?: string | null
  }) => post<StaffQualification>('/admin/staff-qualifications', payload),

  /** Recording that somebody checked the certificate. Separate from adding it
   *  because they are different acts by different people. */
  verifyQualification: (qualificationId: string) =>
    post<StaffQualification>(`/admin/staff-qualifications/${qualificationId}/verify`, {}),
}

/* ── Leave ───────────────────────────────────────────────────────────────── */

export interface LeaveRequestQuery {
  staff_id?: string
  leave_type_id?: string
  status?: string
  search?: string
  page?: number
  per_page?: number
}

export const leaveApi = {
  types: () => get<LeaveType[]>('/admin/leave-types'),

  createType: (payload: Partial<LeaveType> & { name: string; code: string }) =>
    post<LeaveType>('/admin/leave-types', payload),

  requests: (query: LeaveRequestQuery) =>
    getPage<LeaveRequest>('/admin/leave-requests', {
      params: { per_page: PER_PAGE_DEFAULT, ...query },
    }),

  request: (id: string) => get<LeaveRequest>(`/admin/leave-requests/${id}`),

  submit: (payload: {
    leave_type_id: string
    staff_id?: string
    start_on: string
    end_on: string
    starts_half_day?: boolean
    ends_half_day?: boolean
    reason?: string | null
    contact_during_leave?: string | null
  }) => post<LeaveRequest>('/admin/leave-requests', payload),

  /** One endpoint for both answers — `approve` is the boolean, and the notes
   *  are recorded either way. */
  decide: (id: string, payload: { approve: boolean; notes?: string | null }) =>
    post<LeaveRequest>(`/admin/leave-requests/${id}/decide`, payload),

  cancel: (id: string, payload?: { reason?: string }) =>
    post<LeaveRequest>(`/admin/leave-requests/${id}/cancel`, payload ?? {}),

  entitlements: (query: { staff_id?: string; leave_type_id?: string; per_page?: number }) =>
    getPage<LeaveEntitlement>('/admin/leave-entitlements', { params: { per_page: 50, ...query } }),

  /** Every figure is in hundredths of a day — see `formatDays`. */
  grant: (payload: {
    staff_id: string
    leave_type_id: string
    period_start: string
    period_end: string
    entitled_days_x100: number
    carried_over_days_x100?: number
    adjustment_days_x100?: number
    notes?: string | null
  }) => post<LeaveEntitlement>('/admin/leave-entitlements', payload),
}

/* ── Payroll ─────────────────────────────────────────────────────────────── */

export const payrollApi = {
  periods: () => get<PayrollPeriod[]>('/admin/payroll-periods'),

  createPeriod: (payload: {
    name: string
    code: string
    frequency?: string
    starts_on: string
    ends_on: string
    pay_date: string
  }) => post<PayrollPeriod>('/admin/payroll-periods', payload),

  /** Closing a period stops new runs being opened against it. */
  closePeriod: (periodId: string) => command(`/admin/payroll-periods/${periodId}/close`),

  runs: (query?: { payroll_period_id?: string; status?: string; per_page?: number }) =>
    getPage<PayrollRun>('/admin/payroll-runs', { params: { per_page: 50, ...query } }),

  run: (runId: string) => get<PayrollRun>(`/admin/payroll-runs/${runId}`),

  createRun: (payload: { payroll_period_id: string; campus_id?: string | null; notes?: string }) =>
    post<PayrollRun>('/admin/payroll-runs', payload),

  /*
   * The state machine, in the order it is walked. Each returns the run, so the
   * screen reads `is_recalculable` / `is_approved` / `is_posted` back rather
   * than guessing what the status now permits.
   */
  calculate: (runId: string) => post<PayrollRun>(`/admin/payroll-runs/${runId}/calculate`, {}),
  approve: (runId: string) => post<PayrollRun>(`/admin/payroll-runs/${runId}/approve`, {}),
  post: (runId: string) => post<PayrollRun>(`/admin/payroll-runs/${runId}/post`, {}),
  /** A reason is required — the API refuses a cancellation without one. */
  cancel: (runId: string, reason: string) =>
    post<PayrollRun>(`/admin/payroll-runs/${runId}/cancel`, { reason }),
  publishPayslips: (runId: string) =>
    command(`/admin/payroll-runs/${runId}/payslips/publish`),

  payslips: (query?: { payroll_run_id?: string; staff_id?: string; per_page?: number }) =>
    getPage<Payslip>('/admin/payslips', { params: { per_page: 50, ...query } }),
}

/**
 * One root for the whole section, so a change that crosses it invalidates
 * cleanly — approving a run changes its payslips, and granting an entitlement
 * changes a staff member's leave balance.
 */
export const hrKeys = {
  all: ['hr'] as const,
  staffList: (params?: unknown) => ['hr', 'staff', 'list', params] as const,
  staff: (id: string) => ['hr', 'staff', 'detail', id] as const,
  staffPhoto: (id: string) => ['hr', 'staff', 'detail', id, 'photo'] as const,
  qualifications: (id: string) => ['hr', 'staff', 'detail', id, 'qualifications'] as const,
  positions: ['hr', 'positions'] as const,
  leaveTypes: ['hr', 'leave', 'types'] as const,
  leaveRequests: (params?: unknown) => ['hr', 'leave', 'requests', params] as const,
  entitlements: (params?: unknown) => ['hr', 'leave', 'entitlements', params] as const,
  payrollPeriods: ['hr', 'payroll', 'periods'] as const,
  payrollRuns: (params?: unknown) => ['hr', 'payroll', 'runs', params] as const,
  payslips: (params?: unknown) => ['hr', 'payroll', 'payslips', params] as const,
}
