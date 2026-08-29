import { get, post } from '@/shared/api/client'

/**
 * The week: who is where, when.
 *
 * ── Two surfaces, and the narrowing is different on each ───────────────────
 *
 * `/admin/timetables` builds the week and is gated by TimetablePolicy — may
 * this person touch THIS timetable. `/portal/timetable` reads one week and
 * deliberately does NOT consult that policy: its learner guard refuses students
 * on purpose, because a scoped `timetable.view` would hand one the whole
 * institution's schedule. The portal narrows by IDENTITY instead — your own
 * student record, an authorized child's, or your staff record — and a named
 * `student_id` can only intersect that set, never extend it.
 *
 * ── Staff before children, on the portal ───────────────────────────────────
 *
 * A teacher who is also a parent gets their own teaching week by default and
 * their child's by asking. Ordered the other way round, a teaching parent could
 * not see their own timetable at all.
 *
 * ── Names arrive only where the server loaded them ─────────────────────────
 *
 * Every field on a slot is an id except the four names at the end, which are
 * read from relations the endpoint chose to load and are null otherwise. A grid
 * that fell back to an id would print "Room 9c40b1" — which is what the payload
 * looked like before those fields existed.
 */

export type SubjectType = 'student' | 'staff' | 'group' | 'none'

/** One lesson in a week, as the reader is entitled to see it. */
export interface ScheduledSlot {
  slot_id: string
  timetable_id: string
  timetable_period_id: string | null
  course_offering_id: string | null
  learning_group_id: string | null
  staff_id: string | null
  room_id: string | null
  /** 1 = Monday, as the API numbers it. */
  day_of_week: number
  starts_at: string
  ends_at: string
  weeks: number[] | null
  status: string
  /**
   * The server's answer, which already accounts for an exception on the day
   * asked about. A cancelled lesson is still SHOWN — a class turning up to an
   * empty room is what hiding it causes — and it is shown as cancelled.
   */
  is_cancelled: boolean
  exception_kind: string | null
  exception_reason: string | null
  notes: string | null
  course_title: string | null
  group_name: string | null
  teacher_name: string | null
  room_name: string | null
}

/** One person's week, or one class's. */
export interface TimetableView {
  timetable_id: string | null
  timetable_name: string | null
  /** Whose week this is. `none` is a member with no student, staff or child
   *  record — an empty week rather than an error, because nothing is wrong. */
  subject_type: SubjectType
  subject_id: string | null
  /** The date the week was resolved for; exceptions are applied against it. */
  on_date: string | null
  slots: ScheduledSlot[]
}

export interface TimetablePeriod {
  id: string
  timetable_id: string
  name: string
  starts_at: string
  ends_at: string
  sequence: number
  /** False for break and lunch — the bell rings, nothing is taught. */
  is_teaching: boolean
}

export interface Timetable {
  id: string
  academic_session_id: string | null
  academic_period_id: string | null
  campus_id: string | null
  name: string
  status: string
  is_published: boolean
  effective_from: string | null
  effective_to: string | null
  periods?: TimetablePeriod[]
  slots?: ScheduledSlot[]
}

export const timetableApi = {
  /**
   * The reader's own week.
   *
   * `on` picks the week — exceptions are resolved against that date, so a
   * cancelled lesson shows as cancelled on the day it was cancelled and not on
   * the others. `student_id` is how a guardian names which child.
   */
  mine: (params: { on?: string; student_id?: string } = {}) =>
    get<TimetableView>('/portal/timetable', {
      params: { on: params.on || undefined, student_id: params.student_id || undefined },
    }),

  /* ── Building the week ─────────────────────────────────────────────── */

  timetables: () => get<Timetable[]>('/admin/timetables'),

  timetable: (id: string) => get<Timetable>(`/admin/timetables/${id}`),

  /** Archives whatever it replaces. Not a status field — a publish is an act
   *  on every register that will be taken against it. */
  publish: (id: string) => post<Timetable>(`/admin/timetables/${id}/publish`),
}

export const timetableKeys = {
  root: ['timetable'] as const,
  mine: (params: unknown) => ['portal', 'me', 'timetable', params] as const,
  timetables: ['admin', 'timetables'] as const,
  timetable: (id: string) => ['admin', 'timetables', id] as const,
}

/** Monday first, as `day_of_week` numbers them. */
export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

/** The Monday of the week containing a date, as `YYYY-MM-DD`. */
export function weekStart(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  /* getDay() is Sunday-first; shift so Monday is the start. */
  const offset = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - offset)

  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`
}

/** "09:05" from whatever shape the API sends a time in. */
export function slotTime(value: string): string {
  const match = /(\d{1,2}):(\d{2})/.exec(value)

  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : value
}
