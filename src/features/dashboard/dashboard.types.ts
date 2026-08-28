/**
 * Payload shapes, transcribed from live responses against the seeded
 * Greenfield institution.
 *
 * Not copied from a schema: several portal resources omit relation-derived
 * names unless the controller eager-loaded them, so a field that exists in the
 * PHP resource may still be absent from the wire. Everything optional below is
 * optional because a real response left it out.
 */

/* ── Administrator ───────────────────────────────────────────────────────── */

export interface DashboardMetricValue {
  metric: string
  label: string
  value: number
}

/** `GET /admin/dashboard/summary`. `today` and `month` carry the same metric
 *  ids in the same order, which is what lets one tile show both. */
export interface DashboardSummary {
  metrics: { id: string; label: string }[]
  today: DashboardMetricValue[]
  month: DashboardMetricValue[]
  period: { today: string; month: string }
  locale: string
  timezone: string
}

/** `GET /admin/students/statistics`. The breakdown keys are the API's own
 *  enums, so they are read as a map rather than as fixed fields — a status
 *  added server-side then appears rather than being silently dropped. */
export interface StudentStatistics {
  total: number
  on_roll: number
  by_status: Record<string, number>
  by_gender: Record<string, number>
}

export interface CollectionTotals {
  payment_count: number
  charged_minor: number
  bursaries_minor: number
  write_offs_minor: number
  collected_minor: number
}

export interface CollectionPeriod extends CollectionTotals {
  /** `2026-08-14` at day granularity, `2026-08` at month. */
  period: string
}

/** `GET /admin/finance/summary`. Every `_minor` is an integer in the smallest
 *  unit of `currency` — never divided by hand, always through `formatMoney`. */
export interface CollectionSummary {
  currency: string
  granularity: 'day' | 'month'
  from: string
  to: string
  totals: CollectionTotals
  periods: CollectionPeriod[]
}

/* ── Teaching staff ──────────────────────────────────────────────────────── */

/** A row of `GET /admin/course-offerings`. The listing is narrowed server-side
 *  to what the reader may see, and `?staff_id=` narrows it further to the ones
 *  this person actually instructs. */
export interface CourseOfferingRow {
  id: string
  code: string
  status: string
  capacity: number | null
  registered_count: number
  has_space: boolean
  course_id: string
  course_title: string | null
  course_code: string | null
  academic_session_name: string | null
  academic_period_name: string | null
  campus_name: string | null
  learning_group_id: string | null
  learning_group_name: string | null
}

/** A row of `GET /teaching/gradebooks` — one per offering the caller teaches. */
export interface GradebookRow {
  id: string
  course_offering_id: string
  course_offering_code: string | null
  course_title: string | null
  course_code: string | null
  learning_group_id: string | null
  learning_group_name: string | null
  academic_period_name: string | null
  status: string
  is_locked: boolean
  is_published: boolean
  is_visible_to_students: boolean
  assessments_count: number
}

/** A row of `GET /teaching/attendance/excuses`. */
export interface AttendanceExcuseRow {
  id: string
  student_id: string
  starts_on: string
  ends_on: string
  reason: string | null
  category: string | null
  status: string
  has_document: boolean
  student: {
    id: string
    student_number: string | null
    name: string | null
    has_photo: boolean
  } | null
}

/* ── Learner and guardian ────────────────────────────────────────────────── */

export interface PersonSummary {
  id: string
  full_name: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  date_of_birth: string | null
  gender: string | null
  has_photo: boolean
}

/** An element of `GET /portal/my-record` — which is an ARRAY: a guardian has
 *  one entry per child, a learner exactly one. */
export interface PortalRecord {
  student_id: string
  student_number: string | null
  admission_number: string | null
  status: string
  admission_date: string | null
  graduation_date: string | null
  is_on_roll: boolean
  person: PersonSummary
  program: { id: string; name: string; code: string | null } | null
  level: { id: string; name: string; sequence: number | null } | null
  learning_groups: { id: string; name: string; code: string | null }[]
}

/** `GET /portal/finance/balance`. A guardian names the child with
 *  `?student_id=`; without one the API refuses rather than guessing. */
export interface PortalBalance {
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

/**
 * A row of `GET /portal/attendance`.
 *
 * The endpoint returns the same figures at several granularities at once: one
 * row per period, one per learning group, and one for the whole session with
 * both ids null. `sessionWideAttendance` picks the last of those.
 */
export interface PortalAttendance {
  student_id: string
  academic_session_id: string | null
  academic_period_id: string | null
  learning_group_id: string | null
  course_offering_id: string | null
  sessions_total: number
  required_sessions: number
  present_count: number
  absent_count: number
  late_count: number
  excused_count: number
  attendance_percentage: number
  computed_at: string | null
}

/** A slot of `GET /portal/timetable`. Every name field is null unless the
 *  resolver loaded the relation, so a slot may honestly know only its ids. */
export interface TimetableSlot {
  slot_id: string
  course_offering_id: string | null
  learning_group_id: string | null
  staff_id: string | null
  room_id: string | null
  day_of_week: number
  starts_at: string
  ends_at: string
  status: string
  is_cancelled: boolean
  exception_kind: string | null
  exception_reason: string | null
  notes: string | null
  course_title: string | null
  group_name: string | null
  teacher_name: string | null
  room_name: string | null
}

export interface TimetableView {
  timetable_id: string | null
  timetable_name: string | null
  subject_type: 'student' | 'staff' | 'none' | string
  subject_id: string | null
  on_date: string | null
  slots: TimetableSlot[]
}

/** A row of `GET /portal/results` — one published course grade. */
export interface PortalResult {
  id: string
  course_offering_id: string | null
  course: { id: string; title: string | null; code: string | null } | null
  percentage: number | null
  letter_grade: string | null
  grade_point: number | null
  is_passing: boolean | null
  status: string
  published_at: string | null
}

/** A row of `GET /portal/assignments`. */
export interface PortalAssignment {
  id: string
  course_offering_id: string | null
  course_title?: string | null
  course_code?: string | null
  title: string
  submission_kind: string | null
  max_score: number | null
  opens_at: string | null
  due_at: string | null
  closes_at: string | null
  status: string
  status_label: string | null
}

/** A row of `GET /portal/announcements`. */
export interface PortalAnnouncement {
  id: string
  title: string
  body: string | null
  audience_kind: string | null
  status: string
  is_pinned: boolean
  published_at: string | null
  expires_at: string | null
  has_expired: boolean
}

/**
 * The broadest attendance row the API returned — the one that is not narrowed
 * to a period, a group or a single offering.
 *
 * Falls back to the first row rather than to nothing: an institution that
 * computes attendance only per period would otherwise show a learner a blank
 * where it holds a real figure.
 */
export function sessionWideAttendance(
  rows: PortalAttendance[] | undefined,
): PortalAttendance | null {
  if (!rows || rows.length === 0) return null
  return (
    rows.find(
      (row) =>
        row.academic_period_id === null &&
        row.learning_group_id === null &&
        row.course_offering_id === null,
    ) ?? rows[0]
  )
}
