import { get, getPage, post, put } from '@/shared/api/client'
import type { Paginated } from '@/shared/api/envelope'
import type {
  CourseOffering,
  LearningGroup,
  LearningGroupMember,
} from '@/features/academics/academics.types'
import type { GradebookSummary } from '@/features/assessment/gradebook.api'
import type { ScheduledSlot } from '@/features/timetable/timetable.api'

/**
 * One class, and everything that happens to it.
 *
 * ── The class is an address, not a container ───────────────────────────────
 *
 * Almost nothing here is stored ON the learning group. Its subjects are course
 * offerings that point at it; its timetable is slots that point at those
 * offerings; its gradebooks hang off them too. So this client is mostly
 * FILTERS — `?learning_group_id=` — and that is the API's design rather than a
 * shortcut: narrowing an existing listing keeps one set of scope rules, where a
 * nested route would be a second place for "whose class is this" to be decided.
 *
 * ── Two things that are genuinely the class's own ──────────────────────────
 *
 * The roll (`/members`) and the register-and-promotion history. Everything else
 * is reached through what points at it.
 *
 * ── The class teacher is a field, not an endpoint ──────────────────────────
 *
 * `form_tutor_staff_id` on the group itself, set through the ordinary update.
 * OMITTING it leaves the current tutor alone and sending `null` unassigns —
 * the controller distinguishes the two with `$request->exists()`, so this
 * client must never send `undefined` where it means "no change" and must send
 * an explicit null where it means "remove".
 */

/* ── The roll ────────────────────────────────────────────────────────────── */

export interface MemberQuery {
  search?: string
  /** Off by default: the roll is who is in the class NOW. Past members are a
   *  different question and a longer list. */
  include_past?: boolean
  page?: number
  per_page?: number
}

/* ── The attendance report ───────────────────────────────────────────────── */

export interface AttendanceCounts {
  marks_total: number
  present_count: number
  absent_count: number
  late_count: number
  excused_count: number
  left_early_count: number
  attendance_percentage: number
  registers_taken?: number
  learners_marked?: number
}

export interface AttendanceByDay {
  session_id: string
  session_date: string
  status: string
  counts: AttendanceCounts
}

export interface AttendanceByLearner {
  student_id: string
  student_number: string | null
  name: string
  counts: AttendanceCounts
}

/**
 * The register sheet for a window.
 *
 * `ever_taken` is the difference between "nobody has been absent" and "nobody
 * has taken a register" — two states that look identical in the totals and mean
 * opposite things to whoever is reading.
 */
export interface AttendanceReport {
  learning_group_id: string
  ever_taken: boolean
  range: { from: string; to: string }
  totals: AttendanceCounts
  by_day: AttendanceByDay[]
  by_learner: AttendanceByLearner[]
}

export interface AttendanceReportQuery {
  from?: string
  to?: string
  academic_period_id?: string
}

/* ── Assigning subjects ──────────────────────────────────────────────────── */

export interface AssignCoursesInput {
  academic_period_id: string
  course_ids: string[]
  elective_course_ids?: string[]
  capacity?: number | null
  delivery_mode?: string
  status?: string
}

/** What assigning answered with. `existing` is not a failure — it is the
 *  subjects the class already took, and saying so is what stops somebody
 *  pressing again. */
export interface AssignCoursesResult {
  learning_group_id: string
  academic_period_id: string
  created_count: number
  skipped_count: number
  created: CourseOffering[]
  existing: CourseOffering[]
}

/**
 * How many rows a class page shows at once.
 *
 * Ten, deliberately small. Every list on this screen is something a person
 * reads rather than scrolls past — a roll they are marking, the subjects a
 * class takes, its mark books — and a page that ends is a page somebody
 * finishes. It also keeps the register honest: ten names is about what fits
 * above the fold with the marking bar visible.
 */
export const CLASS_PAGE_SIZE = 10

const ROOT = '/admin/learning-groups'

export const classroomApi = {
  detail: (id: string) => get<LearningGroup>(`${ROOT}/${id}`),

  /**
   * Set or clear the class teacher.
   *
   * A PUT on the group, because that is the only endpoint that writes it. Null
   * unassigns; this method never sends the key absent, since absent means "no
   * change" to the controller and would silently do nothing.
   */
  setClassTeacher: (id: string, staffId: string | null) =>
    put<LearningGroup>(`${ROOT}/${id}`, { form_tutor_staff_id: staffId }),

  members: (id: string, query: MemberQuery = {}): Promise<Paginated<LearningGroupMember>> =>
    getPage<LearningGroupMember>(`${ROOT}/${id}/members`, {
      params: {
        search: query.search || undefined,
        include_past: query.include_past ? 1 : undefined,
        page: query.page,
        per_page: query.per_page,
      },
    }),

  /** One learner at a time — the endpoint runs a MOVE, taking them off whatever
   *  class they were in and recording it. */
  addMember: (id: string, studentId: string, effectiveOn?: string) =>
    post<LearningGroupMember>(`${ROOT}/${id}/members`, {
      student_id: studentId,
      effective_on: effectiveOn,
    }),

  removeMember: (id: string, studentId: string, effectiveOn?: string) =>
    post(`${ROOT}/${id}/members/${studentId}`, { effective_on: effectiveOn }),

  /**
   * The class's own week.
   *
   * Under the learning-groups module rather than the timetable one, so a class
   * page still draws its week for an institution that never bought the
   * timetable builder — the slots it shows already exist. Cancelled slots are
   * included, and are shown as cancelled.
   */
  timetable: (id: string) => get<ScheduledSlot[]>(`${ROOT}/${id}/timetable`),

  attendance: (id: string, query: AttendanceReportQuery = {}) =>
    get<AttendanceReport>(`${ROOT}/${id}/attendance`, {
      params: {
        from: query.from || undefined,
        to: query.to || undefined,
        academic_period_id: query.academic_period_id || undefined,
      },
    }),

  /** The subjects this class takes. A filter on the offerings listing rather
   *  than a nested route — see the file note. */
  subjects: (id: string, page = 1) =>
    getPage<CourseOffering>('/admin/course-offerings', {
      params: { learning_group_id: id, page, per_page: CLASS_PAGE_SIZE },
    }),

  /** Chosen in one go, because a registrar setting up a class picks nine
   *  subjects at once and doing it one at a time is nine dialogs. */
  assignCourses: (id: string, input: AssignCoursesInput) =>
    post<AssignCoursesResult>(`${ROOT}/${id}/courses`, input),

  /** Everyone on the roll takes this subject. A fact about the CLASS, which is
   *  why it is addressed by the class — the per-learner route exists and
   *  putting thirty through it is thirty requests. Takes no body. */
  registerAll: (id: string, offeringId: string) =>
    post<{ registered: number; existing: number; skipped: number }>(
      `${ROOT}/${id}/courses/${offeringId}/registrations`,
    ),

  /** The class's mark books, one per subject. Reached by filtering the
   *  teaching listing, which keeps the reader scoping in one place. */
  gradebooks: (id: string, page = 1) =>
    getPage<GradebookSummary>('/teaching/gradebooks', {
      params: { learning_group_id: id, page, per_page: CLASS_PAGE_SIZE },
    }),
}

export const classroomKeys = {
  root: (id: string) => ['admin', 'learning-groups', id] as const,
  detail: (id: string) => ['admin', 'learning-groups', id, 'detail'] as const,
  members: (id: string, query: unknown) => ['admin', 'learning-groups', id, 'members', query] as const,
  timetable: (id: string) => ['admin', 'learning-groups', id, 'timetable'] as const,
  attendance: (id: string, query: unknown) =>
    ['admin', 'learning-groups', id, 'attendance', query] as const,
  subjects: (id: string, page: number) =>
    ['admin', 'learning-groups', id, 'subjects', page] as const,
  gradebooks: (id: string, page: number) =>
    ['admin', 'learning-groups', id, 'gradebooks', page] as const,
}
