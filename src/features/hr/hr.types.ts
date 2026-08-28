/**
 * Staff, leave and payroll — transcribed from the API's own resources.
 *
 * ── Two scaled-integer conventions, and they are different ─────────────────
 *
 * Money is in MINOR units (`*_minor`): kobo, cents. Days are in HUNDREDTHS
 * (`*_x100`), so half a day is 50 and twenty days is 2000. Both exist to keep
 * arithmetic exact, and neither may be divided by hand — `formatDays` and
 * `formatMoney` are the only places that know the scale.
 *
 * ── The whole surface is administrative ────────────────────────────────────
 *
 * Every endpoint below is 403 for a teacher, confirmed against the live API.
 * There is no portal branch to write, unlike students and guardians.
 */

/* ── Staff ───────────────────────────────────────────────────────────────── */

export interface StaffPerson {
  id: string
  full_name: string
  first_name: string
  last_name: string
  preferred_name: string | null
  date_of_birth: string | null
  gender: string | null
  has_photo: boolean
}

export const EMPLOYMENT_STATUSES = ['active', 'suspended', 'terminated'] as const
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'volunteer'] as const

export interface StaffRow {
  id: string
  employee_number: string | null
  employment_status: string
  employment_type: string | null
  job_title: string | null
  hire_date: string | null
  termination_date: string | null
  person: StaffPerson
}

/**
 * One posting: which unit and campus a person works in, from when.
 *
 * Returned INLINE on the staff record. The standalone
 * `/admin/staff-assignments` endpoint is gated on the institution keeping an
 * organizational chart — a school whose divisions are its sections gets a
 * domain 404 with that as the message — so the record reads assignments from
 * here and the management screen is only offered where the chart exists.
 */
export interface StaffAssignment {
  id: string
  is_primary: boolean
  starts_on: string | null
  ends_on: string | null
  position_id: string | null
  position_name: string | null
  campus_id: string | null
  campus_name: string | null
  organizational_unit_id: string | null
  organizational_unit_name: string | null
}

export interface StaffRecord extends StaffRow {
  assignments: StaffAssignment[]
  assignment_count: number
  course_offering_count: number
}

export interface StaffPosition {
  id: string
  name: string
  code: string | null
  description: string | null
  status: string
}

export const QUALIFICATION_KINDS = [
  'degree',
  'diploma',
  'certification',
  'licence',
  'training',
  'other',
] as const

export interface StaffQualification {
  id: string
  staff_id: string
  kind: string
  title: string
  awarding_body: string | null
  field_of_study: string | null
  reference: string | null
  awarded_on: string | null
  expires_on: string | null
  /** Computed by the API against today — do not recompute from `expires_on`. */
  has_expired: boolean
  is_verified: boolean
  verified_at: string | null
  verified_by_staff_id: string | null
}

/* ── Leave ───────────────────────────────────────────────────────────────── */

export interface LeaveType {
  id: string
  name: string
  code: string | null
  status: string
  is_paid: boolean
  requires_approval: boolean
  allows_negative_balance: boolean
  counts_weekends: boolean
  default_entitlement_days_x100: number
  max_carry_over_days_x100: number | null
  min_notice_days: number
  max_consecutive_days_x100: number | null
  description: string | null
}

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const

export interface LeaveRequest {
  id: string
  reference: string | null
  status: string
  staff_id: string
  leave_type_id: string
  start_on: string
  end_on: string
  starts_half_day: boolean
  ends_half_day: boolean
  reason: string | null
  contact_during_leave: string | null
  submitted_by_staff_id: string | null
  submitted_at: string | null
  decided_at: string | null
  decided_by_staff_id: string | null
  decision_notes: string | null
  current_step: number | null
}

/** Every figure is in hundredths of a day. `remaining` is the API's own sum —
 *  entitled + carried over + adjustment − taken − pending. */
export interface LeaveEntitlement {
  id: string
  staff_id: string
  leave_type_id: string
  period_start: string
  period_end: string
  entitled_days_x100: number
  carried_over_days_x100: number
  adjustment_days_x100: number
  taken_days_x100: number
  pending_days_x100: number
  total_days_x100: number
  remaining_days_x100: number
}

/* ── Payroll ─────────────────────────────────────────────────────────────── */

export const PAYROLL_FREQUENCIES = ['monthly', 'biweekly', 'weekly', 'daily', 'ad_hoc'] as const

export interface PayrollPeriod {
  id: string
  name: string
  code: string | null
  frequency: string
  starts_on: string
  ends_on: string
  pay_date: string
  status: string
  /** Whether a new run may be opened against it. */
  accepts_runs: boolean
  is_mutable: boolean
  closed_at: string | null
}

/**
 * One calculation of one period, for one campus.
 *
 * The state machine is the point: draft → calculate → approve → post, with
 * cancel available until it is posted and payslips published after. The three
 * booleans are the API's own reading of where it is, and the screen reads them
 * rather than inferring from `status`.
 */
export interface PayrollRun {
  id: string
  payroll_period_id: string
  campus_id: string | null
  run_number: number | null
  status: string
  currency: string
  gross_minor: number
  deductions_minor: number
  net_minor: number
  employer_cost_minor: number
  payslip_count: number
  is_recalculable: boolean
  is_approved: boolean
  is_posted: boolean
  calculated_at: string | null
  approved_at: string | null
  approved_by_staff_id: string | null
  posted_at: string | null
  journal_entry_id: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
}

export interface Payslip {
  id: string
  payroll_run_id: string
  staff_id: string
  employment_contract_id: string | null
  reference: string | null
  status: string
  currency: string
  basic_minor: number
  earnings_minor: number
  gross_minor: number
  taxable_minor: number
  pensionable_minor: number
  deductions_minor: number
  statutory_deductions_minor: number
  employer_contributions_minor: number
  net_minor: number
  unpaid_leave_days_x100: number
  published_at: string | null
  paid_at: string | null
}

/**
 * Days are stored in hundredths so half a day is exact.
 *
 * The only place in this feature that knows the scale. Renders `2000` as
 * "20 days" and `50` as "half a day", because "0.5 days" is how a form reads,
 * not how a person speaks.
 */
export function formatDays(x100: number | null | undefined): string {
  if (x100 === null || x100 === undefined || Number.isNaN(x100)) return '—'
  const days = x100 / 100
  if (days === 0.5) return 'half a day'
  if (days === 1) return '1 day'
  const shown = Number.isInteger(days) ? String(days) : days.toFixed(2).replace(/0$/, '')
  return `${shown} days`
}

/** The inverse, for a form that collects days and must send hundredths. */
export function toDaysX100(value: string): number | undefined {
  const days = Number(value)
  if (value.trim() === '' || Number.isNaN(days)) return undefined
  return Math.round(days * 100)
}
