import { del, get, getPage, post, put } from '@/shared/api/client'

/**
 * Course material: units, and the lessons inside them.
 *
 * ── Two surfaces, one narrowing ────────────────────────────────────────────
 *
 * `teaching/learning-modules` is the authoring side and includes drafts;
 * `portal/learning/modules` is the reading side and does not. Reach is
 * identical — the API narrows both with the same Action — so the difference
 * between a teacher's list and a learner's is visibility, never scope.
 *
 * This client speaks the teaching surface, because this screen is where
 * material is written.
 *
 * ── Publishing a unit does not publish its lessons ─────────────────────────
 *
 * Deliberate, and the API refuses a lesson published inside a draft unit with a
 * 409. A unit is the folder and a lesson is the page: opening the folder in
 * September has not finished the twelve pages inside it, and a class works
 * through a unit a week at a time.
 *
 * WITHDRAWING a unit does withdraw its lessons, because `published` on a lesson
 * reads the lesson's own timestamp — a lesson left published inside a withdrawn
 * unit would be a page whose folder is shut that the portal would still serve.
 *
 * ── Reordering sends the whole order ───────────────────────────────────────
 *
 * Ids in an array, position is the sequence. Sending `{id, sequence}` pairs
 * would let two lessons carry the same number, and the screen that produced it
 * is a list that already knows the order.
 */

export type ContentStatus = 'draft' | 'published'

export interface LearningModule {
  id: string
  course_offering_id: string | null
  course_id: string | null
  /** Which of the two owners this unit has — the API's own answer, so no screen
   *  has to infer it from which id is null. */
  owner_kind: 'course' | 'course_offering'
  /** Absent unless the endpoint eager-loaded the course. */
  course_title?: string | null
  course_code?: string | null
  title: string
  description: string | null
  sequence: number
  status: ContentStatus
  published_at: string | null
  /** The timestamp is the fact; the status is the label. */
  is_published: boolean
  lesson_count?: number
  published_lesson_count?: number
  /** Present on the single-record endpoint. Titles only — a body travels when
   *  a lesson is opened, never on a contents page. */
  lessons?: Lesson[]
  created_at: string | null
}

export interface Lesson {
  id: string
  learning_module_id: string
  title: string
  /**
   * ABSENT on a listing, null when the lesson is a placeholder somebody has not
   * written yet. The two are different and a screen that conflated them would
   * render an unwritten lesson and a summarised one identically.
   */
  body?: string | null
  sequence: number
  status: ContentStatus
  published_at: string | null
  is_published: boolean
  created_at: string | null
}

export interface ModuleInput {
  title: string
  description?: string | null
  sequence?: number
}

export interface LessonInput {
  title: string
  body?: string | null
  sequence?: number
}

const TEACHING = '/teaching/learning-modules'

export const lessonsApi = {
  modules: (params: {
    course_id?: string
    course_offering_id?: string
    status?: ContentStatus | ''
    search?: string
    page?: number
  }) =>
    getPage<LearningModule>(TEACHING, {
      params: {
        course_id: params.course_id || undefined,
        course_offering_id: params.course_offering_id || undefined,
        status: params.status || undefined,
        search: params.search || undefined,
        page: params.page,
      },
    }),

  module: (id: string) => get<LearningModule>(`${TEACHING}/${id}`),

  /** Material that belongs to the COURSE and outlives any one running of it. */
  createForCourse: (courseId: string, input: ModuleInput) =>
    post<LearningModule>(`/teaching/courses/${courseId}/learning-modules`, input),

  /** Material that belongs to ONE RUNNING of a course — this term's brief. */
  createForOffering: (offeringId: string, input: ModuleInput) =>
    post<LearningModule>(`/teaching/offerings/${offeringId}/learning-modules`, input),

  updateModule: (id: string, input: ModuleInput) => put<LearningModule>(`${TEACHING}/${id}`, input),

  publishModule: (id: string) => post<LearningModule>(`${TEACHING}/${id}/publish`),

  unpublishModule: (id: string) => post<LearningModule>(`${TEACHING}/${id}/unpublish`),

  deleteModule: (id: string) => del(`${TEACHING}/${id}`),

  lessons: (moduleId: string) => get<Lesson[]>(`${TEACHING}/${moduleId}/lessons`),

  lesson: (moduleId: string, lessonId: string) =>
    get<Lesson>(`${TEACHING}/${moduleId}/lessons/${lessonId}`),

  createLesson: (moduleId: string, input: LessonInput) =>
    post<Lesson>(`${TEACHING}/${moduleId}/lessons`, input),

  updateLesson: (moduleId: string, lessonId: string, input: LessonInput) =>
    put<Lesson>(`${TEACHING}/${moduleId}/lessons/${lessonId}`, input),

  publishLesson: (moduleId: string, lessonId: string) =>
    post<Lesson>(`${TEACHING}/${moduleId}/lessons/${lessonId}/publish`),

  unpublishLesson: (moduleId: string, lessonId: string) =>
    post<Lesson>(`${TEACHING}/${moduleId}/lessons/${lessonId}/unpublish`),

  deleteLesson: (moduleId: string, lessonId: string) =>
    del(`${TEACHING}/${moduleId}/lessons/${lessonId}`),

  /** Answers with the MODULE, because ids the caller did not name have moved
   *  too — a client that trusted its own array would draw an order the server
   *  does not have. */
  reorderLessons: (moduleId: string, lessonIds: string[]) =>
    put<LearningModule>(`${TEACHING}/${moduleId}/lessons/order`, { lesson_ids: lessonIds }),
}

/**
 * The same material, as the class reads it.
 *
 * `module:lms` and no `staff`. Reach is identical to the teaching listing — the
 * API narrows both with the same Action — and the only difference is
 * visibility: this side sees published units, and inside them, published
 * lessons. A draft is a 404 rather than a 403, so a learner cannot tell a unit
 * that is not ready from one that does not exist.
 */
export const lessonsPortalApi = {
  modules: () => getPage<LearningModule>('/portal/learning/modules', { params: {} }),

  module: (id: string) => get<LearningModule>(`/portal/learning/modules/${id}`),

  /** The only call on this surface that carries a body. */
  lesson: (moduleId: string, lessonId: string) =>
    get<Lesson>(`/portal/learning/modules/${moduleId}/lessons/${lessonId}`),
}

export const lessonKeys = {
  root: ['teaching', 'learning-modules'] as const,
  portalRoot: ['portal', 'learning'] as const,
  portalModules: ['portal', 'learning', 'modules'] as const,
  portalModule: (id: string) => ['portal', 'learning', 'modules', id] as const,
  portalLesson: (moduleId: string, lessonId: string) =>
    ['portal', 'learning', 'modules', moduleId, 'lessons', lessonId] as const,
  modules: (params: unknown) => ['teaching', 'learning-modules', 'list', params] as const,
  module: (id: string) => ['teaching', 'learning-modules', 'detail', id] as const,
  lesson: (moduleId: string, lessonId: string) =>
    ['teaching', 'learning-modules', moduleId, 'lesson', lessonId] as const,
}
