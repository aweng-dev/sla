import { get, post } from '@/shared/api/client'

/**
 * Taking the register for a class.
 *
 * ── A register is a SESSION, not a set of rows ─────────────────────────────
 *
 * Marking attendance means opening a session for a class on a date, recording
 * against it, and finalising it. That shape is why a half-marked register is a
 * real, resumable state rather than a bug: a teacher interrupted at the tenth
 * name has an open session with ten records, and reopening the screen continues
 * it rather than starting again.
 *
 * ── `mark-remaining-present` is the API's own shortcut ─────────────────────
 *
 * Not a client-side loop over the roster. The endpoint exists because the
 * normal case is "everyone came except these three", and doing it in the
 * browser would be thirty writes racing each other and a different answer for
 * anybody the roster had drifted on.
 *
 * ── Finalising is a separate act ───────────────────────────────────────────
 *
 * `is_finalised` closes the register. Recording and closing are two decisions —
 * a teacher marks through the lesson and closes at the end — and the API keeps
 * them apart, so this client does too.
 */

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'left_early'

export interface AttendanceRecord {
  id: string
  attendance_session_id: string
  student_id: string
  status: AttendanceStatus
  status_label: string
  /** The API's own answer. `late` and `left_early` both count as present, and a
   *  screen that summed statuses itself would eventually disagree with the
   *  figure on a report card. */
  counts_as_present: boolean
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
  /** Closed. Records can be read but not changed. */
  is_finalised: boolean
  taken_at: string | null
  notes: string | null
  records?: AttendanceRecord[]
}

export interface OpenSessionInput {
  learning_group_id: string
  course_offering_id?: string
  academic_session_id?: string
  academic_period_id?: string
  session_date: string
  starts_at?: string
  ends_at?: string
  type?: string
  notes?: string
}

/** One mark. `minutes_late` only means anything alongside `late`. */
export interface MarkInput {
  student_id: string
  status: AttendanceStatus
  minutes_late?: number | null
  arrived_at?: string | null
  remark?: string | null
}

const ROOT = '/teaching/attendance'

export const attendanceApi = {
  /**
   * Open the register for a class on a date.
   *
   * Answers with the session and whatever is already recorded against it, so a
   * resumed register arrives with its ten marks intact.
   */
  openSession: (input: OpenSessionInput) => post<AttendanceSession>(`${ROOT}/sessions`, input),

  session: (id: string) => get<AttendanceSession>(`${ROOT}/sessions/${id}`),

  /** One name, changed on its own — the correction after everything else. */
  mark: (sessionId: string, input: MarkInput) =>
    post<AttendanceRecord>(`${ROOT}/sessions/${sessionId}/records`, input),

  /** The whole register in one write. A teacher marks a class in one pass, and
   *  thirty requests is thirty chances for half of them to land. */
  markMany: (sessionId: string, records: MarkInput[]) =>
    post<AttendanceRecord[]>(`${ROOT}/sessions/${sessionId}/records/bulk`, { records }),

  /** "Everyone else came." The server decides who is remaining, against the
   *  roster it holds rather than the one this screen drew. */
  markRemainingPresent: (sessionId: string) =>
    post<AttendanceSession>(`${ROOT}/sessions/${sessionId}/records/mark-remaining-present`),

  /** Close it. Two decisions, kept apart — see the file note. */
  finalise: (sessionId: string) => post<AttendanceSession>(`${ROOT}/sessions/${sessionId}/finalise`),
}

export const attendanceKeys = {
  root: ['teaching', 'attendance'] as const,
  session: (id: string) => ['teaching', 'attendance', 'session', id] as const,
}

/**
 * How each status reads, and whether it counts as being there.
 *
 * `counts_as_present` is the server's field and the one that must be trusted
 * for any total. This is only for labelling a control the teacher is about to
 * press.
 */
export const ATTENDANCE_STATUSES: {
  value: AttendanceStatus
  label: string
  short: string
}[] = [
  { value: 'present', label: 'Present', short: 'P' },
  { value: 'late', label: 'Late', short: 'L' },
  { value: 'absent', label: 'Absent', short: 'A' },
  { value: 'excused', label: 'Excused', short: 'E' },
  { value: 'left_early', label: 'Left early', short: 'X' },
]

/** The order a click cycles through. Present → Absent → Late is the sequence a
 *  register is actually taken in; the rarer two are chosen deliberately. */
export const CYCLE: AttendanceStatus[] = ['present', 'absent', 'late']
