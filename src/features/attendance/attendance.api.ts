import { get, post } from '@/shared/api/client'
import { params } from '@/features/academics/academics.api'
import type {
  AttendanceExcuse,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  AttendanceSummary,
  GroupAttendance,
} from './attendance.types'

/**
 * Every attendance call, split by who may make it.
 *
 * ── Taking a register is three calls, not one ──────────────────────────────
 *
 *   1. `POST /teaching/attendance/sessions` opens one for a group on a date.
 *   2. `POST …/records/bulk` writes the marks.
 *   3. `POST …/finalise` closes it.
 *
 * The split is deliberate on the API's part and worth keeping: a register that
 * is open but unmarked is a real state — the tutor started it and was
 * interrupted — and a single "save attendance" call could not express it.
 *
 * ── There is no way to delete a register ───────────────────────────────────
 *
 * No DELETE exists on `/teaching/attendance/sessions/{id}`. Opening one is a
 * fact about a day that happened, so the screen confirms the date before
 * opening rather than offering an undo it does not have.
 *
 * ── `smart_attendance` gates nothing ───────────────────────────────────────
 *
 * The module appears in the navigation but no route in the API is registered
 * behind `module:smart_attendance` — the same as `lms` and `learning_progress`.
 * There is nothing to call, so nothing is wrapped here.
 */

export interface OpenRegisterPayload {
  session_date: string
  learning_group_id?: string | null
  course_offering_id?: string | null
  academic_session_id?: string | null
  academic_period_id?: string | null
  /** `H:i` or `H:i:s`. A daily register usually leaves both unset. */
  starts_at?: string | null
  ends_at?: string | null
  notes?: string | null
}

export interface MarkPayload {
  student_id: string
  status: AttendanceStatus
  minutes_late?: number | null
  arrived_at?: string | null
  remark?: string | null
}

export const attendanceApi = {
  /* ── Staff: taking the register ─────────────────────────────────────── */

  openRegister: (payload: OpenRegisterPayload) =>
    post<AttendanceSession>('/teaching/attendance/sessions', payload),

  /** The register WITH its records. The day rows in a group's history carry
   *  only counts, so this is the call that produces a markable roll. */
  register: (sessionId: string) =>
    get<AttendanceSession>(`/teaching/attendance/sessions/${sessionId}`),

  mark: (sessionId: string, payload: MarkPayload) =>
    post<AttendanceRecord>(`/teaching/attendance/sessions/${sessionId}/records`, payload),

  /** One request for the whole roll. A register of thirty marked one at a time
   *  is thirty round trips and thirty chances to half-save. */
  markBulk: (sessionId: string, records: MarkPayload[]) =>
    post<AttendanceRecord[]>(`/teaching/attendance/sessions/${sessionId}/records/bulk`, {
      records,
    }),

  /** The "everyone else is here" button. A tutor marks the four absences and
   *  this closes the other twenty-six — which is the actual shape of taking a
   *  register, and why the API has a route for it. */
  markRemainingPresent: (sessionId: string) =>
    post<AttendanceRecord[]>(
      `/teaching/attendance/sessions/${sessionId}/records/mark-remaining-present`,
    ),

  /** Closes it to further marking. */
  finalise: (sessionId: string) =>
    post<AttendanceSession>(`/teaching/attendance/sessions/${sessionId}/finalise`),

  /* ── Staff: a group's record ────────────────────────────────────────── */

  groupHistory: (groupId: string, query: { from?: string; to?: string } = {}) =>
    get<GroupAttendance>(`/admin/learning-groups/${groupId}/attendance`, {
      params: params(query),
    }),

  /* ── Staff: absence notes from home ─────────────────────────────────── */

  excuses: (query: { status?: string } = {}) =>
    get<AttendanceExcuse[]>('/teaching/attendance/excuses', { params: params(query) }),

  /** `note` is required when declining — the API enforces it with
   *  `required_if:approve,false`, because a refusal a family cannot read the
   *  reason for is not a decision anybody can act on. */
  reviewExcuse: (excuseId: string, payload: { approve: boolean; note?: string | null }) =>
    post<AttendanceExcuse>(`/teaching/attendance/excuses/${excuseId}/review`, payload),
}

/* ── Learner and guardian ───────────────────────────────────────────────── */

export const portalAttendanceApi = {
  /** Already computed server-side, one row per session/period. */
  summary: (query: { student_id?: string } = {}) =>
    get<AttendanceSummary[]>('/portal/attendance', { params: params(query) }),

  records: (query: { student_id?: string; per_page?: number } = {}) =>
    get<AttendanceRecord[]>('/portal/attendance/records', { params: params(query) }),

  submitExcuse: (payload: {
    student_id: string
    starts_on: string
    ends_on: string
    reason: string
    attendance_record_id?: string | null
  }) => post<AttendanceExcuse>('/portal/attendance/excuses', payload),
}
