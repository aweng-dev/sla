/**
 * Shapes for the Attendance surface, transcribed from live responses against
 * the seeded registers (JSS 1A has five, 65 marks, 80% attendance).
 *
 * ── A register is a SESSION, not a date ────────────────────────────────────
 *
 * The API models taking a register as opening an `attendance_session` for a
 * group on a day, then writing a record per learner into it. That indirection
 * is what makes "the register was opened but nobody was marked" expressible,
 * and it is why the screen has to open one before it can mark anybody.
 *
 * ── The records carry no names ─────────────────────────────────────────────
 *
 * `AttendanceRecordResource` returns `student_id` and nothing about the
 * person. The roll therefore comes from the learning group's membership and
 * the marks are joined onto it client-side — which is also the only way to
 * show a learner who has no record yet, i.e. the ones still to be marked.
 */

/** What a mark can be. `excused` is a decision somebody made; `absent` is the
 *  absence of one — the two are not interchangeable. */
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused', 'left_early'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
  left_early: 'Left early',
}

/** How the institution takes a register at all — from
 *  `institution.attendance_mode`. A school runs `daily`; a university runs
 *  `course`, where the register belongs to an offering rather than a class. */
export const ATTENDANCE_MODES = ['daily', 'half_day', 'period', 'course', 'session'] as const
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number]

export interface AttendanceRecord {
  id: string
  attendance_session_id: string
  student_id: string
  status: AttendanceStatus
  status_label: string | null
  /** The server's own answer about whether this mark counts toward the
   *  attendance percentage — `late` does, `absent` does not, and the rule is
   *  the institution's rather than this app's. */
  counts_as_present: boolean | null
  minutes_late: number | null
  arrived_at: string | null
  remark: string | null
  recorded_by_staff_id: string | null
  updated_at: string | null
}

export interface AttendanceSession {
  id: string
  course_offering_id: string | null
  learning_group_id: string | null
  academic_session_id: string | null
  academic_period_id: string | null
  taken_by_staff_id: string | null
  session_date: string
  starts_at: string | null
  ends_at: string | null
  type: string
  status: string
  /** Finalised registers are closed to further marking. `status` says `taken`
   *  or `finalised`; this is the boolean the screen gates its controls on. */
  is_finalised: boolean
  taken_at: string | null
  notes: string | null
  /** Present on a detail read, absent on the day rows in the history. */
  records?: AttendanceRecord[]
}

/* ── A group's history ──────────────────────────────────────────────────── */

export interface AttendanceCounts {
  marks_total: number
  present_count: number
  absent_count: number
  late_count: number
  excused_count: number
  left_early_count: number
  attendance_percentage: number
}

export interface AttendanceDay {
  session_id: string
  session_date: string
  status: string
  counts: AttendanceCounts
}

export interface GroupAttendance {
  learning_group_id: string
  /** False for a group whose register has never once been taken — which is a
   *  different screen from a group with a run of zero-attendance days. */
  ever_taken: boolean
  range: { from: string; to: string }
  totals: AttendanceCounts & { registers_taken: number; learners_marked: number }
  by_day: AttendanceDay[]
}

/* ── A learner's own standing ───────────────────────────────────────────── */

/**
 * `GET /portal/attendance` — one row per session/period/offering the learner
 * has been marked in, already computed server-side.
 *
 * `required_sessions` can differ from `sessions_total`: a learner who joined
 * mid-term is not held to registers taken before they arrived.
 */
export interface AttendanceSummary {
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

/* ── Excuses ────────────────────────────────────────────────────────────── */

export const EXCUSE_STATUSES = ['pending', 'approved', 'declined'] as const
export type ExcuseStatus = (typeof EXCUSE_STATUSES)[number]

export interface AttendanceExcuse {
  id: string
  student_id: string
  /** Set when the note is about one specific mark rather than a date range. */
  attendance_record_id: string | null
  starts_on: string
  ends_on: string
  reason: string
  category: string | null
  status: ExcuseStatus
  has_document: boolean
  reviewed_by_staff_id: string | null
  reviewed_at: string | null
  review_note: string | null
  student: {
    id: string
    student_number: string | null
    name: string
    has_photo: boolean
  } | null
}
