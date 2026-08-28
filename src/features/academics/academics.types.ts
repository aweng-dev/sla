/**
 * Shapes for the Academics surface, transcribed from live responses.
 *
 * ── Two conventions the API follows here, and one it does not ──────────────
 *
 * Rows are FLAT and pre-joined: a learning group carries
 * `academic_session_name` beside `academic_session_id`, an offering carries
 * `course_title` and `course_code`. So a list screen never needs a second
 * request to render a readable row, and the `*_name` fields are the right
 * thing to show — resolving the id against a catalogue would be a slower way
 * to get the same string.
 *
 * Rows also carry their own affordances: `can_manage`, `is_removable`,
 * `is_open`, `has_space`. These say what the SERVER will allow, which is not
 * always what the permission list implies — a session with enrolments is not
 * removable however much `academic_sessions.manage` a reader holds. Screens
 * gate on these, not on guesses.
 *
 * What it does NOT do is enumerate the `type` fields. `academic_levels.type`,
 * `learning_groups.type`, `courses.course_type` and `programs.type` are all
 * validated as `string|max:80` — free labels an institution chooses, not
 * enums. They are typed as `string` here for that reason, and the forms offer
 * the values already in use rather than a closed list this app invented.
 */

/* ── Academic sessions ──────────────────────────────────────────────────── */

/** `draft` and `upcoming` are pre-open; `completed` and `archived` are past.
 *  Only one session is `is_current` at a time. */
export type AcademicSessionStatus = 'draft' | 'upcoming' | 'active' | 'completed' | 'archived'

export interface AcademicSession {
  id: string
  name: string
  code: string | null
  starts_on: string
  ends_on: string
  admission_starts_on: string | null
  admission_ends_on: string | null
  registration_starts_on: string | null
  registration_ends_on: string | null
  is_current: boolean
  is_default: boolean
  status: AcademicSessionStatus
  status_label: string
  /** Whether enrolment and registration are accepted right now. Distinct from
   *  `status`: a session can be `active` and closed. */
  is_open: boolean
  period_count: number
  /** False once anything hangs off it. A delete button drawn against a false
   *  here is a button that will 409. */
  is_removable: boolean
  can_manage: boolean
  created_at: string
  updated_at: string
}

/* ── Academic periods ───────────────────────────────────────────────────── */

/** The API's full list. Which of these an institution actually uses comes from
 *  `institution.period_terms`, so a school offers "Term" and a university
 *  "Semester" without this list shrinking. */
export const ACADEMIC_PERIOD_TYPES = [
  'term',
  'semester',
  'trimester',
  'quarter',
  'module',
  'block',
  'phase',
  'rotation',
  'session_period',
  'assessment_period',
  'training_period',
  'summer',
  'other',
] as const

export type AcademicPeriodType = (typeof ACADEMIC_PERIOD_TYPES)[number]

export interface AcademicPeriod {
  id: string
  name: string
  code: string | null
  type: AcademicPeriodType
  type_label: string
  sequence: number
  academic_session_id: string
  academic_session_name: string
  /** Periods nest — a semester holding two half-terms. `child_count` says
   *  whether this one does. */
  parent_id: string | null
  parent_name: string | null
  starts_on: string
  ends_on: string
  registration_starts_on: string | null
  registration_ends_on: string | null
  assessment_starts_on: string | null
  assessment_ends_on: string | null
  result_publication_at: string | null
  is_current: boolean
  status: string
  status_label: string
  is_open: boolean
  child_count: number
  can_manage: boolean
  created_at: string
  updated_at: string
}

/* ── Academic levels ────────────────────────────────────────────────────── */

export interface AcademicLevel {
  id: string
  parent_id: string | null
  parent_name: string | null
  name: string
  code: string
  type: string | null
  sequence: number
  status: string
  metadata: unknown
  created_at: string
  child_count: number
}

/** `GET /admin/academic-levels/tree` — the same rows, nested, and WITHOUT
 *  `parent_name`/`child_count` (the nesting carries both). */
export interface AcademicLevelNode {
  id: string
  parent_id: string | null
  name: string
  code: string
  type: string | null
  sequence: number
  status: string
  metadata: unknown
  created_at: string
  children: AcademicLevelNode[]
}

/* ── Programmes ─────────────────────────────────────────────────────────── */

export const DURATION_UNITS = ['days', 'weeks', 'months', 'years'] as const
export type DurationUnit = (typeof DURATION_UNITS)[number]

/** Present on programmes and courses. Null for an institution that keeps no
 *  organizational chart — a school's divisions are its sections. */
export interface OrganizationalUnitRef {
  id: string
  name: string
  code: string | null
}

export interface Program {
  id: string
  name: string
  code: string
  type: string | null
  qualification_type: string | null
  duration_value: number | null
  duration_unit: DurationUnit | null
  credit_requirement: number | null
  description: string | null
  status: string
  organizational_unit: OrganizationalUnitRef | null
  campus_count: number
  curriculum_count: number
  enrollment_count: number
  can_manage: boolean
  created_at: string
  updated_at: string
}

/* ── Courses ────────────────────────────────────────────────────────────── */

export interface Course {
  id: string
  code: string
  title: string
  description: string | null
  credit_units: number | null
  contact_hours: number | null
  course_type: string | null
  status: string
  organizational_unit: OrganizationalUnitRef | null
  offering_count: number
  assessment_count: number
  enrollment_count: number
  can_manage: boolean
  created_at: string
  updated_at: string
}

/* ── Learning groups ────────────────────────────────────────────────────── */

export interface StaffRef {
  id: string
  name: string
  employee_number?: string | null
  job_title?: string | null
}

export interface LearningGroup {
  id: string
  name: string
  code: string
  type: string
  status: string
  capacity: number | null
  occupancy: number
  /** Derived server-side from capacity minus occupancy. Null capacity means
   *  uncapped, and this stays true. */
  has_space: boolean
  academic_session_id: string | null
  academic_session_name: string | null
  academic_period_id: string | null
  academic_period_name: string | null
  program_id: string | null
  program_name: string | null
  academic_level_id: string | null
  academic_level_name: string | null
  campus_id: string | null
  campus_name: string | null
  parent_id: string | null
  form_tutor_staff_id: string | null
  form_tutor: StaffRef | null
  can_manage?: boolean
  created_at?: string
  updated_at?: string
}

export interface StudentRef {
  id: string
  student_number: string | null
  name: string
  has_photo: boolean
}

export interface LearningGroupMember {
  id: string
  learning_group_id: string
  academic_session_id: string | null
  group_type: string
  student_id: string
  student: StudentRef
  status: string
  joined_at: string | null
  left_at: string | null
}

/* ── Course offerings ───────────────────────────────────────────────────── */

export const DELIVERY_MODES = ['physical', 'online', 'hybrid'] as const
export type DeliveryMode = (typeof DELIVERY_MODES)[number]

export const OFFERING_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const
export type OfferingStatus = (typeof OFFERING_STATUSES)[number]

export const INSTRUCTOR_ROLES = ['instructor', 'assistant', 'examiner', 'coordinator'] as const
export type InstructorRole = (typeof INSTRUCTOR_ROLES)[number]

export interface OfferingInstructor {
  id: string
  course_offering_id: string
  staff_id: string
  role: InstructorRole
  is_primary: boolean
  name: string
  employee_number: string | null
  job_title: string | null
}

export interface CourseOffering {
  id: string
  code: string
  status: OfferingStatus
  delivery_mode: DeliveryMode
  capacity: number | null
  is_elective: boolean
  registered_count: number
  has_space: boolean
  course_id: string
  course_title: string
  course_code: string
  academic_session_id: string | null
  academic_session_name: string | null
  academic_period_id: string
  academic_period_name: string | null
  campus_id: string | null
  campus_name: string | null
  learning_group_id: string | null
  learning_group_name: string | null
  program_id: string | null
  program_name: string | null
  starts_at: string | null
  ends_at: string | null
  instructors: OfferingInstructor[]
  can_manage?: boolean
  created_at?: string
  updated_at?: string
}

export interface CourseRegistration {
  id: string
  student_id: string
  student: StudentRef
  course_offering_id: string
  academic_session_id: string | null
  academic_period_id: string | null
  registration_type: string
  status: string
  is_active: boolean
  registered_at: string | null
}

/* ── Enrolment ──────────────────────────────────────────────────────────── */

export const ENROLLMENT_STATUSES = [
  'pending',
  'active',
  'completed',
  'withdrawn',
  'transferred',
  'suspended',
  'cancelled',
] as const

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number]

export interface SessionEnrollment {
  id: string
  student_id: string
  student: StudentRef
  academic_session_id: string
  academic_session_name: string | null
  program_id: string | null
  program_name: string | null
  campus_id: string | null
  campus_name: string | null
  academic_level_id: string | null
  academic_level_name: string | null
  learning_group_id: string | null
  learning_group_name?: string | null
  status: EnrollmentStatus
  started_at?: string | null
  ended_at?: string | null
}

/* ── Academic calendar ──────────────────────────────────────────────────── */

export const CALENDAR_ENTRY_KINDS = ['holiday', 'exam', 'meeting', 'event', 'deadline'] as const
export type CalendarEntryKind = (typeof CALENDAR_ENTRY_KINDS)[number]

export interface AcademicCalendar {
  id: string
  name: string
  academic_session_id: string
  academic_session_name?: string | null
  status?: string
  status_label?: string | null
  starts_on?: string | null
  ends_on?: string | null
  entry_count?: number
  published_at?: string | null
  can_manage?: boolean
  [key: string]: unknown
}

export interface CalendarEntry {
  id: string
  academic_calendar_id: string
  title: string
  kind: CalendarEntryKind
  starts_on: string
  ends_on: string | null
  is_instructional?: boolean
  description?: string | null
  [key: string]: unknown
}

/* ── Curriculum ─────────────────────────────────────────────────────────── */

export const CURRICULUM_VERSION_STATUSES = ['draft', 'published', 'retired'] as const
export type CurriculumVersionStatus = (typeof CURRICULUM_VERSION_STATUSES)[number]

/**
 * `GET /admin/courses/{course}/curriculum` — the scheme of work for one
 * subject, or the empty shell when none exists yet.
 *
 * `editable` is the server's answer about whether this reader may change it,
 * and `version` is null until somebody creates one. Both are null/false for
 * every subject in a fresh institution, so the screen's main job is the empty
 * state rather than the editor.
 */
export interface SubjectCurriculum {
  subject: { id: string; title: string; code: string }
  level: { id: string; name: string } | null
  address: string | null
  version: {
    id: string
    name?: string | null
    status?: CurriculumVersionStatus
    [key: string]: unknown
  } | null
  editable: boolean
  modules: CurriculumModule[]
}

export interface CurriculumModule {
  id: string
  title: string
  sequence: number
  description?: string | null
  [key: string]: unknown
}

/* ── Thin catalogue rows, for pickers ───────────────────────────────────── */

export interface CatalogItem {
  id: string
  name: string
  code?: string | null
  [key: string]: unknown
}
