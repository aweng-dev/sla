import { command, del, get, getPage, post, put } from '@/shared/api/client'

/**
 * Where marks are entered, and what becomes of them.
 *
 * ── The gradebook and the results workflow share one module gate ───────────
 *
 * Both sit under `module:gradebook` in the API — `results` gates only the
 * learner-facing `/portal/results`. That is deliberate on the server's side:
 * calculating, approving and publishing are acts ON a mark book, and a school
 * that runs one without the other has nothing to publish.
 *
 * ── Four steps, four endpoints, and the separation is the design ───────────
 *
 * Calculate turns scores into course grades. Approve says a human has checked
 * them. Publish releases them to learners and, optionally, guardians. Unlock
 * reopens a locked book and DEMANDS a reason, because reopening a published
 * result is the one action somebody will be asked to account for.
 *
 * Each is authorized against the permission that names it, which is how a class
 * teacher ends up able to calculate and not to approve or release.
 */

export type GradebookStatus = string

export interface GradebookSummary {
  id: string
  course_offering_id: string
  course_offering_code: string | null
  course_id: string | null
  course_title: string | null
  course_code: string | null
  learning_group_id: string | null
  learning_group_name: string | null
  academic_session_id: string | null
  academic_session_name: string | null
  academic_period_id: string | null
  academic_period_name: string | null
  grading_scheme_id: string | null
  status: GradebookStatus
  /** The server's own answers. A locked book refuses score writes; a published
   *  one is visible to the people below. */
  is_locked: boolean
  is_published: boolean
  is_visible_to_students: boolean
  is_visible_to_guardians: boolean
  locked_at: string | null
  published_at: string | null
  assessments_count?: number
  created_at: string | null
}

export interface GradebookItem {
  id: string
  gradebook_id: string
  assessment_category_id: string | null
  title: string
  code: string | null
  type: string
  max_score: number
  weight_percent: number | null
  counts_toward_final: boolean
  is_extra_credit: boolean
  due_at: string | null
  published_at: string | null
  status: string
  sequence: number
}

export interface RosterStudent {
  id: string
  student_number: string | null
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  display_name: string
}

export interface Score {
  id: string
  gradebook_item_id: string
  student_id: string
  /** Null is a mark not yet given, which is different from zero. */
  score: number | null
  status: string
  is_late: boolean
  is_excused: boolean
  feedback: string | null
  graded_at: string | null
}

/** `GET /teaching/gradebooks/{id}` — the book, its assessments, its roster and
 *  every mark already entered, in one payload the grid is drawn from. */
export interface GradebookDetail extends GradebookSummary {
  items?: GradebookItem[]
  students?: RosterStudent[]
  scores?: Score[]
}

export interface ItemInput {
  title: string
  code?: string | null
  type?: string
  description?: string | null
  max_score: number
  weight_percent?: number | null
  counts_toward_final?: boolean
  is_extra_credit?: boolean
  due_at?: string | null
  assessment_category_id?: string | null
}

export interface ScoreInput {
  student_id: string
  /** Null clears a mark. The API keeps that distinct from a zero. */
  score: number | null
  is_late?: boolean
  is_excused?: boolean
  feedback?: string | null
}

export const gradebookApi = {
  list: (params: { course_offering_id?: string; status?: string; page?: number }) =>
    getPage<GradebookSummary>('/teaching/gradebooks', {
      params: {
        course_offering_id: params.course_offering_id || undefined,
        status: params.status || undefined,
        page: params.page,
      },
    }),

  detail: (id: string) => get<GradebookDetail>(`/teaching/gradebooks/${id}`),

  /** Closing the book. Reopening is `unlock`, which demands a reason. */
  lock: (id: string) => put<GradebookDetail>(`/teaching/gradebooks/${id}`, { status: 'locked' }),

  createItem: (gradebookId: string, input: ItemInput) =>
    post<GradebookItem>(`/teaching/gradebooks/${gradebookId}/items`, input),

  updateItem: (gradebookId: string, itemId: string, input: ItemInput) =>
    put<GradebookItem>(`/teaching/gradebooks/${gradebookId}/items/${itemId}`, input),

  deleteItem: (gradebookId: string, itemId: string) =>
    del(`/teaching/gradebooks/${gradebookId}/items/${itemId}`),

  recordScore: (gradebookId: string, itemId: string, input: ScoreInput) =>
    post<Score>(`/teaching/gradebooks/${gradebookId}/items/${itemId}/scores`, input),

  /**
   * A column at a time.
   *
   * A teacher marks a class in one sitting, and thirty separate requests is
   * thirty chances for half of them to land. `reason` travels with it because
   * re-marking an already-graded column is audited.
   */
  recordScores: (gradebookId: string, itemId: string, scores: ScoreInput[], reason?: string) =>
    post<Score[]>(`/teaching/gradebooks/${gradebookId}/items/${itemId}/scores/bulk`, {
      scores,
      reason,
    }),

  /* ── The results workflow ────────────────────────────────────────────── */

  previewResult: (gradebookId: string, studentId: string) =>
    get<Record<string, unknown>>(`/teaching/gradebooks/${gradebookId}/results/preview/${studentId}`),

  calculate: (gradebookId: string) =>
    post<unknown[]>(`/teaching/gradebooks/${gradebookId}/results/calculate`),

  approve: (gradebookId: string) => command(`/teaching/gradebooks/${gradebookId}/results/approve`),

  publish: (gradebookId: string, visibleToGuardians: boolean) =>
    command(`/teaching/gradebooks/${gradebookId}/results/publish`, {
      visible_to_guardians: visibleToGuardians,
    }),

  /** Demands a reason: reopening a published result is the one action somebody
   *  will be asked to account for. */
  unlock: (gradebookId: string, reason: string) =>
    post<GradebookDetail>(`/teaching/gradebooks/${gradebookId}/results/unlock`, { reason }),
}

export const gradebookKeys = {
  root: ['teaching', 'gradebooks'] as const,
  list: (params: unknown) => ['teaching', 'gradebooks', 'list', params] as const,
  detail: (id: string) => ['teaching', 'gradebooks', 'detail', id] as const,
}
