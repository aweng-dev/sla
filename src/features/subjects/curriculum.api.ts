import { del, get, getPage, post, put } from '@/shared/api/client'

/**
 * What each class is taught in one subject.
 *
 * ── The offering is the whole relationship ─────────────────────────────────
 *
 * A curriculum belongs to a COURSE OFFERING, which is already "this subject,
 * taught to this class, in this session, in this term". So there is no subject
 * id, class id, session id or term id on any payload below: they cannot be
 * passed inconsistently because they cannot be passed at all, and the server
 * flattens them onto the response so a heading can be printed without four
 * more requests.
 *
 * Class A's Mathematics and Class C's Mathematics are two offerings, so they
 * are two documents. There is deliberately no way to write one curriculum
 * against a subject.
 *
 * ── Distinct from the programme curriculum ─────────────────────────────────
 *
 * `/admin/curricula` is the programme document — what a programme requires,
 * versioned and binding on a cohort. This is what 3B is actually taught this
 * term. Both use the same units-and-lessons content endpoints, because a unit
 * of work is the same record in either.
 *
 * ── Duplicating produces an INDEPENDENT copy ───────────────────────────────
 *
 * Every unit and lesson is inserted afresh server-side. `source_curriculum_id`
 * records where it came from and carries no behaviour: editing Class A's
 * cannot reach Class C's, which is the guarantee somebody relies on when they
 * duplicate rather than start again.
 */

export type CurriculumStatus = 'draft' | 'published' | 'archived'

/** Somewhere a lesson's material can be found. `url` is optional because
 *  "Chapter 4 of the New General Mathematics" is a resource and has no link. */
export interface CurriculumResource {
  label: string
  url?: string | null
}

export interface CurriculumTopic {
  id: string
  curriculum_module_id: string
  title: string
  summary: string | null
  /** A BlockNote document, as stored. Never HTML — the editor reads and writes
   *  this array directly, so there is no conversion anywhere. */
  notes?: unknown[]
  has_notes?: boolean
  /**
   * What a learner should be able to do afterwards.
   *
   * First-class rather than a heading inside `notes`, because these are what
   * other things point at: an inspection asks for them and an assessment is
   * written to cover them. Always an array — the column defaults to `[]` and a
   * check constraint holds it there.
   */
  objectives?: string[]
  /** What the lesson is taught from. Always an array, for the same reason. */
  resources?: CurriculumResource[]
  kind: string
  duration_minutes: number | null
  sequence: number
}

export interface CurriculumModule {
  id: string
  title: string
  description: string | null
  period_hint: string | null
  sequence: number
  topics?: CurriculumTopic[]
}

export interface OfferingCurriculum {
  id: string
  course_offering_id: string

  /* The context, flattened by the server so a heading costs no extra request. */
  course_id: string | null
  course_title: string | null
  course_code: string | null
  learning_group_id: string | null
  learning_group_name: string | null
  academic_session_id: string | null
  academic_session_name: string | null
  academic_period_id: string | null
  academic_period_name: string | null

  title: string
  summary: string | null
  version: string
  status: CurriculumStatus
  /**
   * Whether THIS READER may change this document.
   *
   * A teacher holds the classes they take and not a colleague's, so one
   * listing must offer Publish on one row and not the next. `usePermissions`
   * knows only that the reader holds `curriculum.manage` somewhere, so a
   * screen deriving the answer from it draws controls that 403 on press.
   */
  can_manage: boolean

  /**
   * Whether the content may still be written to.
   *
   * A different question from `can_manage`, and about the DOCUMENT rather than
   * the reader: a database trigger refuses writes to anything that is not a
   * draft, whoever is asking. The server's answer, not a status this screen
   * interprets — a client that re-derived the rule would be the copy that goes
   * stale the day archived stops being frozen.
   */
  is_editable: boolean
  published_at: string | null
  published_by?: string | null
  source_curriculum_id: string | null
  module_count?: number
  modules?: CurriculumModule[]
  created_at: string | null
  updated_at: string | null
}

export interface CurriculumFilters {
  course_id?: string
  learning_group_id?: string
  academic_session_id?: string
  academic_period_id?: string
  status?: CurriculumStatus | ''
  page?: number
  per_page?: number
}

const ROOT = '/admin/offering-curricula'

export const curriculumApi = {
  list: (filters: CurriculumFilters) =>
    getPage<OfferingCurriculum>(ROOT, {
      params: {
        course_id: filters.course_id || undefined,
        learning_group_id: filters.learning_group_id || undefined,
        academic_session_id: filters.academic_session_id || undefined,
        academic_period_id: filters.academic_period_id || undefined,
        status: filters.status || undefined,
        page: filters.page,
        per_page: filters.per_page,
      },
    }),

  detail: (id: string) => get<OfferingCurriculum>(`${ROOT}/${id}`),

  /** Started against the class–subject assignment, never against a subject. */
  create: (
    offeringId: string,
    input: { title: string; summary?: string | null; version?: string },
  ) => post<OfferingCurriculum>(`/admin/course-offerings/${offeringId}/curricula`, input),

  update: (id: string, input: { title: string; summary?: string | null; version?: string }) =>
    put<OfferingCurriculum>(`${ROOT}/${id}`, input),

  /** Deep copy onto another class, session or term. The target must take the
   *  same subject; the server refuses with a 409 if it does not. */
  duplicate: (
    id: string,
    input: { course_offering_id: string; title?: string; version?: string },
  ) => post<OfferingCurriculum>(`${ROOT}/${id}/duplicate`, input),

  /** Freezes the content by database trigger. */
  publish: (id: string) => post<OfferingCurriculum>(`${ROOT}/${id}/publish`),

  /** The only way past the freeze. */
  withdraw: (id: string) => post<OfferingCurriculum>(`${ROOT}/${id}/withdraw`),

  archive: (id: string) => post<OfferingCurriculum>(`${ROOT}/${id}/archive`),

  discard: (id: string) => del(`${ROOT}/${id}`),
}

/* ── Units and lessons ───────────────────────────────────────────────────── */

/**
 * The content endpoints, shared with the programme curriculum.
 *
 * A unit of work is the same record in either document, so these are the
 * existing `curriculum-modules` and `curriculum-topics` routes rather than a
 * parallel set — one content model, one editor, one reorder rule.
 */
export const curriculumContentApi = {
  createModule: (curriculumId: string, input: { title: string; description?: string | null }) =>
    post<CurriculumModule>(`${ROOT}/${curriculumId}/modules`, input),

  updateModule: (moduleId: string, input: { title?: string; description?: string | null }) =>
    put<CurriculumModule>(`/admin/scheme-modules/${moduleId}`, input),

  deleteModule: (moduleId: string) => del(`/admin/scheme-modules/${moduleId}`),

  /** The whole order in one call: a reorder is one decision, and half of it
   *  applied is a unit list nobody chose. */
  reorderModules: (curriculumId: string, moduleIds: string[]) =>
    post<CurriculumModule[]>(`${ROOT}/${curriculumId}/modules/reorder`, { order: moduleIds }),

  createTopic: (moduleId: string, input: { title: string; summary?: string | null }) =>
    post<CurriculumTopic>(`/admin/scheme-modules/${moduleId}/topics`, input),

  /** Autosave writes here. `notes` is the BlockNote document, sent as it is
   *  held — no HTML, no conversion. */
  updateTopic: (
    topicId: string,
    input: {
      title?: string
      summary?: string | null
      notes?: unknown[]
      objectives?: string[]
      resources?: CurriculumResource[]
      duration_minutes?: number | null
    },
  ) => put<CurriculumTopic>(`/admin/scheme-topics/${topicId}`, input),

  deleteTopic: (topicId: string) => del(`/admin/scheme-topics/${topicId}`),

  reorderTopics: (moduleId: string, topicIds: string[]) =>
    post<CurriculumTopic[]>(`/admin/scheme-modules/${moduleId}/topics/reorder`, {
      order: topicIds,
    }),
}

export const curriculumKeys = {
  root: ['admin', 'offering-curricula'] as const,
  list: (filters: unknown) => ['admin', 'offering-curricula', 'list', filters] as const,
  detail: (id: string) => ['admin', 'offering-curricula', 'detail', id] as const,
}
