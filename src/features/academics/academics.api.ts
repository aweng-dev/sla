import { command, del, get, getPage, patch, post, put } from '@/shared/api/client'
import type { Paginated } from '@/shared/api/envelope'
import type {
  AcademicCalendar,
  AcademicLevel,
  AcademicLevelNode,
  AcademicPeriod,
  AcademicSession,
  CalendarEntry,
  CatalogItem,
  Course,
  CourseOffering,
  CourseRegistration,
  LearningGroup,
  LearningGroupMember,
  OfferingInstructor,
  Program,
  SessionEnrollment,
  ProgrammeRequirement,
} from './academics.types'

/**
 * Every Academics call, grouped by the resource it acts on.
 *
 * ── Why the verbs are not uniform ──────────────────────────────────────────
 *
 * Sessions and periods update with PATCH; levels, programmes, courses, groups
 * and offerings update with PUT. That is the API's shape, not an inconsistency
 * this layer should paper over — a PUT sent to a PATCH route answers 405, so
 * the difference has to survive into the client. Each call below uses the verb
 * its route is registered with.
 *
 * ── Lifecycle is POST to a named sub-route, never a status field ───────────
 *
 * Opening, closing, archiving and making-current are separate endpoints
 * (`/open`, `/close`, `/archive`, `/make-current`) rather than a `status`
 * write. The distinction is real: closing a session runs domain work — it is
 * not the same as setting a column — and the server refuses transitions that
 * do not apply. So screens call these, and never try to reach the same end by
 * PATCHing `status`.
 *
 * ── What is deliberately absent ────────────────────────────────────────────
 *
 * `GET /admin/programs/{id}/graduation-requirements` answers 403 even to an
 * institution owner holding every programme permission — it sits behind the
 * graduation module, which is off for this institution. It is not wrapped
 * here, because a method that always 403s is worse than no method: somebody
 * eventually calls it and builds a screen around the failure.
 *
 * `GET /admin/campuses` and `GET /admin/organizational-units` answer 404 with
 * RESOURCE_NOT_FOUND for a school — "This institution is not arranged into
 * campuses." That is an answer about the institution TYPE, not an error, so
 * the callers below are gated on `institution.supports_campuses` and
 * `supports_organizational_units` rather than on a permission.
 */

/* ── Query shapes ───────────────────────────────────────────────────────── */

export interface PageQuery {
  page?: number
  per_page?: number
}

export interface SessionQuery extends PageQuery {
  search?: string
  status?: string
}

export interface PeriodQuery extends PageQuery {
  academic_session_id?: string
  search?: string
  type?: string
}

export interface LevelQuery extends PageQuery {
  search?: string
  parent_id?: string
  status?: string
}

export interface ProgramQuery extends PageQuery {
  search?: string
  status?: string
  organizational_unit_id?: string
}

export interface CourseQuery extends PageQuery {
  search?: string
  status?: string
  course_type?: string
  organizational_unit_id?: string
}

export interface LearningGroupQuery extends PageQuery {
  search?: string
  status?: string
  type?: string
  academic_session_id?: string
  academic_level_id?: string
  program_id?: string
}

export interface OfferingQuery extends PageQuery {
  search?: string
  status?: string
  course_id?: string
  academic_session_id?: string
  academic_period_id?: string
  learning_group_id?: string
}

export interface EnrollmentQuery extends PageQuery {
  search?: string
  status?: string
  academic_session_id?: string
  program_id?: string
  academic_level_id?: string
  learning_group_id?: string
  student_id?: string
}

/**
 * Strips empty values so a cleared filter drops out of the query string
 * entirely rather than being sent as `status=` — which some endpoints read as
 * a real value and others reject outright.
 *
 * Takes `object` rather than `Record<string, unknown>` so the typed query
 * interfaces above can be passed directly; an interface without an index
 * signature is not assignable to a Record, and widening every query type with
 * `[key: string]: unknown` would give up the checking they exist for.
 */
export function params(query: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out
}

/* ── Academic sessions ──────────────────────────────────────────────────── */

export interface SessionPayload {
  name: string
  starts_on: string
  ends_on: string
  code?: string | null
  admission_starts_on?: string | null
  admission_ends_on?: string | null
  registration_starts_on?: string | null
  registration_ends_on?: string | null
}

export const sessionsApi = {
  list: (query: SessionQuery = {}): Promise<Paginated<AcademicSession>> =>
    getPage<AcademicSession>('/admin/academic-sessions', { params: params(query) }),

  detail: (id: string) => get<AcademicSession>(`/admin/academic-sessions/${id}`),

  create: (payload: SessionPayload) =>
    post<AcademicSession>('/admin/academic-sessions', payload),

  update: (id: string, payload: Partial<SessionPayload>) =>
    patch<AcademicSession>(`/admin/academic-sessions/${id}`, payload),

  remove: (id: string) => del(`/admin/academic-sessions/${id}`),

  /** Exactly one session is current. The server clears the previous one, so
   *  this is a single call and not a swap. */
  makeCurrent: (id: string) => post<AcademicSession>(`/admin/academic-sessions/${id}/make-current`),

  /** `open`/`close` gate enrolment and registration; `archive`/`reopen` move
   *  the session in and out of the past. They are four distinct transitions,
   *  and the server refuses the ones that do not apply from here. */
  open: (id: string) => post<AcademicSession>(`/admin/academic-sessions/${id}/open`),
  close: (id: string) => post<AcademicSession>(`/admin/academic-sessions/${id}/close`),
  archive: (id: string) => post<AcademicSession>(`/admin/academic-sessions/${id}/archive`),
  reopen: (id: string) => post<AcademicSession>(`/admin/academic-sessions/${id}/reopen`),

  /** Copies structure into a new session. Body shape varies by institution, so
   *  callers pass it through rather than this layer inventing one. */
  rollover: (id: string, payload: Record<string, unknown>) =>
    post<AcademicSession>(`/admin/academic-sessions/${id}/rollover`, payload),

  reorderPeriods: (id: string, periodIds: string[]) =>
    put(`/admin/academic-sessions/${id}/periods/order`, { period_ids: periodIds }),
}

/* ── Academic periods ───────────────────────────────────────────────────── */

export interface PeriodPayload {
  academic_session_id: string
  name: string
  starts_on: string
  ends_on: string
  code?: string | null
  type?: string | null
  parent_id?: string | null
  sequence?: number | null
  registration_starts_on?: string | null
  registration_ends_on?: string | null
  assessment_starts_on?: string | null
  assessment_ends_on?: string | null
  result_publication_at?: string | null
}

export const periodsApi = {
  list: (query: PeriodQuery = {}): Promise<Paginated<AcademicPeriod>> =>
    getPage<AcademicPeriod>('/admin/academic-periods', { params: params(query) }),

  detail: (id: string) => get<AcademicPeriod>(`/admin/academic-periods/${id}`),

  create: (payload: PeriodPayload) => post<AcademicPeriod>('/admin/academic-periods', payload),

  update: (id: string, payload: Partial<PeriodPayload>) =>
    patch<AcademicPeriod>(`/admin/academic-periods/${id}`, payload),

  remove: (id: string) => del(`/admin/academic-periods/${id}`),

  makeCurrent: (id: string) => post<AcademicPeriod>(`/admin/academic-periods/${id}/make-current`),
}

/* ── Academic levels ────────────────────────────────────────────────────── */

export interface LevelPayload {
  name: string
  code: string
  type?: string | null
  parent_id?: string | null
  sequence?: number | null
}

export const levelsApi = {
  list: (query: LevelQuery = {}): Promise<Paginated<AcademicLevel>> =>
    getPage<AcademicLevel>('/admin/academic-levels', { params: params(query) }),

  /** The same rows nested. Levels are a hierarchy — a year holding forms —
   *  and the flat list cannot show that. */
  tree: () => get<AcademicLevelNode[]>('/admin/academic-levels/tree'),

  detail: (id: string) => get<AcademicLevel>(`/admin/academic-levels/${id}`),

  create: (payload: LevelPayload) => post<AcademicLevel>('/admin/academic-levels', payload),

  update: (id: string, payload: Partial<LevelPayload>) =>
    put<AcademicLevel>(`/admin/academic-levels/${id}`, payload),

  remove: (id: string) => del(`/admin/academic-levels/${id}`),

  archive: (id: string) => post<AcademicLevel>(`/admin/academic-levels/${id}/archive`),

  /** Re-parenting, which is a different operation from reordering siblings —
   *  it changes the tree's shape rather than the order within one branch. */
  move: (id: string, parentId: string | null) =>
    post<AcademicLevel>(`/admin/academic-levels/${id}/move`, { parent_id: parentId }),

  reorder: (levelIds: string[]) => command('/admin/academic-levels/reorder', { level_ids: levelIds }),
}

/* ── Programmes ─────────────────────────────────────────────────────────── */

export interface ProgramPayload {
  name: string
  code: string
  type?: string | null
  qualification_type?: string | null
  duration_value?: number | null
  duration_unit?: string | null
  credit_requirement?: number | null
  description?: string | null
  organizational_unit_id?: string | null
}

export const programsApi = {
  list: (query: ProgramQuery = {}): Promise<Paginated<Program>> =>
    getPage<Program>('/admin/programs', { params: params(query) }),

  detail: (id: string) => get<Program>(`/admin/programs/${id}`),

  create: (payload: ProgramPayload) => post<Program>('/admin/programs', payload),

  update: (id: string, payload: Partial<ProgramPayload>) =>
    put<Program>(`/admin/programs/${id}`, payload),

  /** There is no DELETE. A programme with enrolments cannot be removed and the
   *  API offers archiving instead — which is the honest operation anyway, since
   *  the records that reference it must keep resolving. */
  archive: (id: string) => post<Program>(`/admin/programs/${id}/archive`),
}

/* ── Courses ────────────────────────────────────────────────────────────── */

export interface CoursePayload {
  code: string
  title: string
  description?: string | null
  credit_units?: number | null
  contact_hours?: number | null
  course_type?: string | null
  organizational_unit_id?: string | null
}

export const coursesApi = {
  list: (query: CourseQuery = {}): Promise<Paginated<Course>> =>
    getPage<Course>('/admin/courses', { params: params(query) }),

  detail: (id: string) => get<Course>(`/admin/courses/${id}`),

  create: (payload: CoursePayload) => post<Course>('/admin/courses', payload),

  update: (id: string, payload: Partial<CoursePayload>) =>
    put<Course>(`/admin/courses/${id}`, payload),

  archive: (id: string) => post<Course>(`/admin/courses/${id}/archive`),

  /**
   * The PROGRAMME requirement for this subject at one year group.
   *
   * Renamed from `curriculum`, which read as "the subject's curriculum" — the
   * one thing this is not. It resolves the four-deep programme chain
   * (curriculum → version → requirement row → scheme of work) for a subject AND
   * an academic level, and it is what a programme requires of a cohort.
   *
   * What a CLASS is actually taught is a different record with a different
   * lifetime: `features/subjects/curriculum.api.ts`, one document per class per
   * term. Two classes taking this subject have two of those and share none of
   * this.
   *
   * `levelId` is not optional. Called without one the endpoint answers "not
   * scoped to one", which is exactly the misreading the rename exists to stop.
   */
  programmeRequirement: (courseId: string, levelId: string) =>
    get<ProgrammeRequirement>(`/admin/courses/${courseId}/curriculum`, {
      params: { academic_level_id: levelId },
    }),
}

/* ── Learning groups ────────────────────────────────────────────────────── */

export interface LearningGroupPayload {
  name: string
  code: string
  type: string
  capacity?: number | null
  academic_session_id?: string | null
  academic_period_id?: string | null
  program_id?: string | null
  academic_level_id?: string | null
  campus_id?: string | null
  parent_id?: string | null
  form_tutor_staff_id?: string | null
}

export const learningGroupsApi = {
  list: (query: LearningGroupQuery = {}): Promise<Paginated<LearningGroup>> =>
    getPage<LearningGroup>('/admin/learning-groups', { params: params(query) }),

  detail: (id: string) => get<LearningGroup>(`/admin/learning-groups/${id}`),

  create: (payload: LearningGroupPayload) =>
    post<LearningGroup>('/admin/learning-groups', payload),

  update: (id: string, payload: Partial<LearningGroupPayload>) =>
    put<LearningGroup>(`/admin/learning-groups/${id}`, payload),

  remove: (id: string) => del(`/admin/learning-groups/${id}`),

  members: (id: string, query: PageQuery = {}): Promise<Paginated<LearningGroupMember>> =>
    getPage<LearningGroupMember>(`/admin/learning-groups/${id}/members`, {
      params: params(query),
    }),

  /**
   * Put one learner on the roll.
   *
   * The endpoint takes ONE `student_id`, not a list — it runs
   * `MoveLearnerToGroup`, which takes them off whatever class they were in and
   * records the move. This used to post `student_ids: []`, which the request
   * refused as a missing `student_id`; nothing called it, so nothing broke.
   *
   * `effective_on` dates the move. Absent means now, which is what a registrar
   * adding somebody in front of them means.
   */
  addMember: (id: string, studentId: string, effectiveOn?: string) =>
    post<LearningGroupMember>(`/admin/learning-groups/${id}/members`, {
      student_id: studentId,
      effective_on: effectiveOn,
    }),

  removeMember: (id: string, studentId: string) =>
    del(`/admin/learning-groups/${id}/members/${studentId}`),

  /** Attach subjects to the group in one request, which creates an offering
   *  per subject rather than making the registrar do it one at a time. */
  attachCourses: (id: string, payload: Record<string, unknown>) =>
    post(`/admin/learning-groups/${id}/courses`, payload),

  timetable: (id: string) => get(`/admin/learning-groups/${id}/timetable`),
}

/* ── Course offerings ───────────────────────────────────────────────────── */

export interface OfferingPayload {
  course_id: string
  academic_period_id: string
  code: string
  academic_session_id?: string | null
  learning_group_id?: string | null
  program_id?: string | null
  campus_id?: string | null
  capacity?: number | null
  delivery_mode?: string | null
  status?: string | null
  is_elective?: boolean
  starts_at?: string | null
  ends_at?: string | null
}

export const offeringsApi = {
  list: (query: OfferingQuery = {}): Promise<Paginated<CourseOffering>> =>
    getPage<CourseOffering>('/admin/course-offerings', { params: params(query) }),

  detail: (id: string) => get<CourseOffering>(`/admin/course-offerings/${id}`),

  create: (payload: OfferingPayload) => post<CourseOffering>('/admin/course-offerings', payload),

  update: (id: string, payload: Partial<OfferingPayload>) =>
    put<CourseOffering>(`/admin/course-offerings/${id}`, payload),

  instructors: (id: string) =>
    get<OfferingInstructor[]>(`/admin/course-offerings/${id}/instructors`),

  addInstructor: (id: string, payload: { staff_id: string; role?: string; is_primary?: boolean }) =>
    post<OfferingInstructor>(`/admin/course-offerings/${id}/instructors`, payload),

  removeInstructor: (id: string, instructorId: string) =>
    del(`/admin/course-offerings/${id}/instructors/${instructorId}`),

  registrations: (id: string, query: PageQuery = {}): Promise<Paginated<CourseRegistration>> =>
    getPage<CourseRegistration>(`/admin/course-offerings/${id}/registrations`, {
      params: params(query),
    }),

  register: (id: string, studentIds: string[]) =>
    post<CourseRegistration[]>(`/admin/course-offerings/${id}/registrations`, {
      student_ids: studentIds,
    }),

  unregister: (id: string, registrationId: string) =>
    del(`/admin/course-offerings/${id}/registrations/${registrationId}`),
}

/* ── Enrolment ──────────────────────────────────────────────────────────── */

export interface EnrollmentPayload {
  student_id: string
  academic_session_id: string
  program_id?: string | null
  academic_level_id?: string | null
  learning_group_id?: string | null
  campus_id?: string | null
  status?: string | null
  started_at?: string | null
}

export const enrollmentsApi = {
  list: (query: EnrollmentQuery = {}): Promise<Paginated<SessionEnrollment>> =>
    getPage<SessionEnrollment>('/admin/enrollments', { params: params(query) }),

  detail: (id: string) => get<SessionEnrollment>(`/admin/enrollments/${id}`),

  create: (payload: EnrollmentPayload) => post<SessionEnrollment>('/admin/enrollments', payload),

  update: (id: string, payload: Partial<EnrollmentPayload>) =>
    patch<SessionEnrollment>(`/admin/enrollments/${id}`, payload),

  /** Ends the enrolment rather than deleting it. A learner who left in March
   *  was still on the roll until March, and the register has to keep saying so. */
  end: (id: string, payload: Record<string, unknown> = {}) =>
    post<SessionEnrollment>(`/admin/enrollments/${id}/end`, payload),
}

/* ── Academic calendar ──────────────────────────────────────────────────── */

export interface CalendarPayload {
  academic_session_id: string
  name: string
  starts_on?: string | null
  ends_on?: string | null
}

export interface CalendarEntryPayload {
  title: string
  kind: string
  starts_on: string
  ends_on?: string | null
  is_instructional?: boolean
  description?: string | null
}

export const calendarsApi = {
  list: (query: PageQuery & { academic_session_id?: string } = {}) =>
    getPage<AcademicCalendar>('/admin/academic-calendars', { params: params(query) }),

  detail: (id: string) => get<AcademicCalendar>(`/admin/academic-calendars/${id}`),

  create: (payload: CalendarPayload) => post<AcademicCalendar>('/admin/academic-calendars', payload),

  update: (id: string, payload: Partial<CalendarPayload>) =>
    put<AcademicCalendar>(`/admin/academic-calendars/${id}`, payload),

  remove: (id: string) => del(`/admin/academic-calendars/${id}`),

  entries: (id: string) => get<CalendarEntry[]>(`/admin/academic-calendars/${id}/entries`),

  addEntry: (id: string, payload: CalendarEntryPayload) =>
    post<CalendarEntry>(`/admin/academic-calendars/${id}/entries`, payload),

  updateEntry: (id: string, entryId: string, payload: Partial<CalendarEntryPayload>) =>
    put<CalendarEntry>(`/admin/academic-calendars/${id}/entries/${entryId}`, payload),

  removeEntry: (id: string, entryId: string) =>
    del(`/admin/academic-calendars/${id}/entries/${entryId}`),

  /** The count of days that actually teach, after holidays are taken out. */
  instructionalDays: (id: string) =>
    get<Record<string, unknown>>(`/admin/academic-calendars/${id}/instructional-days`),

  publish: (id: string) => post<AcademicCalendar>(`/admin/academic-calendars/${id}/publish`),
}

/* ── Catalogues ─────────────────────────────────────────────────────────── */

/**
 * The thin lookups every picker on this surface reads.
 *
 * Bare arrays rather than pages: the catalogue endpoints answer with a capped
 * list and a `meta.truncated` flag, so there is no page to ask for. They are
 * cached hard — a programme list does not change while somebody fills in a
 * form — and shared with the students feature, which reads four of the same
 * keys.
 */
export const academicsCatalog = {
  sessions: () => get<CatalogItem[]>('/admin/catalog/academic-sessions'),
  periods: () => get<CatalogItem[]>('/admin/catalog/academic-periods'),
  levels: () => get<CatalogItem[]>('/admin/catalog/academic-levels'),
  programs: () => get<CatalogItem[]>('/admin/catalog/programs'),
  courses: () => get<CatalogItem[]>('/admin/catalog/courses'),
  groups: () => get<CatalogItem[]>('/admin/catalog/learning-groups'),
  offerings: () => get<CatalogItem[]>('/admin/catalog/course-offerings'),
  units: () => get<CatalogItem[]>('/admin/catalog/organizational-units'),
  campuses: () => get<CatalogItem[]>('/admin/catalog/campuses'),
}
