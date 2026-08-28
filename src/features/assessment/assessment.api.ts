import { command, del, get, getPage, post, put, PER_PAGE_DEFAULT } from '@/shared/api/client'
import type {
  BankPayload,
  QuestionBankRecord,
  QuestionBankRow,
  QuestionPayload,
  QuestionRow,
} from './assessment.types'

/**
 * The question bank surface.
 *
 * ── Which module actually owns this ────────────────────────────────────────
 *
 * Banks and questions are gated on `module:question_bank`, which the
 * institution owner AND the teacher both hold. The EXAM surface
 * (`/teaching/exams/*`) is a different module — `module:cbt` — which this
 * institution grants to teachers and not to the owner, so an administrator
 * gets 403 there. That is why this feature is built on banks: it is the half
 * of assessment both readers can actually reach.
 *
 * `module:assessments`, the item labelled "Assessment and Examination" in the
 * rail, gates NO routes at all. It is an umbrella, which is why `/assessments`
 * is a hub rather than a screen with its own data.
 *
 * ── Filters, read from the controllers ─────────────────────────────────────
 *
 * Banks: `search`, `status`, `course_id`, `mine`.
 * Questions: `search`, `question_bank_id`, `type`, `difficulty`, `status`,
 * `topic`, `outcome_code`, `tags`, `assemblable`.
 *
 * `mine` narrows to banks owned by the caller's STAFF profile. An institution
 * owner has no staff profile — their `owner_staff_id` comes back null — so the
 * filter would hide the banks they created themselves. It is therefore not
 * offered on the screen.
 */

export interface BankListQuery {
  search?: string
  status?: string
  course_id?: string
  page?: number
  per_page?: number
}

export interface QuestionListQuery {
  question_bank_id?: string
  search?: string
  type?: string
  difficulty?: string
  status?: string
  topic?: string
  outcome_code?: string
  assemblable?: boolean
  page?: number
  per_page?: number
}

export const banksApi = {
  list: (query: BankListQuery) =>
    getPage<QuestionBankRow>('/teaching/question-banks', {
      params: { per_page: PER_PAGE_DEFAULT, ...query },
    }),

  detail: (bankId: string) => get<QuestionBankRecord>(`/teaching/question-banks/${bankId}`),

  create: (payload: BankPayload) => post<QuestionBankRecord>('/teaching/question-banks', payload),

  update: (bankId: string, payload: BankPayload) =>
    put<QuestionBankRecord>(`/teaching/question-banks/${bankId}`, payload),

  /** Archiving is a POST with a flag rather than a DELETE, because it is
   *  reversible: `archived: false` brings the bank back. */
  setArchived: (bankId: string, archived: boolean) =>
    command(`/teaching/question-banks/${bankId}/archive`, { archived }),

  /** Soft — the code stays reserved so a restore cannot collide with a bank
   *  created in the meantime. */
  remove: (bankId: string) => del(`/teaching/question-banks/${bankId}`),

  /** Questions belong to a bank, so writing one is nested under it. */
  addQuestion: (bankId: string, payload: QuestionPayload) =>
    post<QuestionRow>(`/teaching/question-banks/${bankId}/questions`, payload),
}

/**
 * The two lookups the bank form chooses from.
 *
 * Defined here rather than reaching into the students feature's `catalogApi`
 * so this feature carries its own dependencies — and because that one has no
 * `courses`. Both endpoints answer 200 for the institution owner AND for a
 * teacher, which the bank form relies on.
 */
export interface CatalogCourse {
  id: string
  name: string
  code: string | null
  credit_value?: string | null
  status?: string
}

export interface CatalogLevel {
  id: string
  name: string
  code: string | null
  sequence: number
}

export const assessmentCatalog = {
  courses: () => get<CatalogCourse[]>('/admin/catalog/courses'),
  levels: () => get<CatalogLevel[]>('/admin/catalog/academic-levels'),
}

export const questionsApi = {
  list: (query: QuestionListQuery) =>
    getPage<QuestionRow>('/teaching/questions', {
      params: { per_page: PER_PAGE_DEFAULT, ...query },
    }),

  /** Carries `versions` and `current_version.options`, which the list does not. */
  detail: (questionId: string) => get<QuestionRow>(`/teaching/questions/${questionId}`),

  /**
   * Editing a question does not overwrite it — it writes a new VERSION and
   * makes that one current. The old wording stays readable, which is what
   * keeps a paper already sat honest.
   */
  revise: (questionId: string, payload: QuestionPayload) =>
    post<QuestionRow>(`/teaching/questions/${questionId}/revisions`, payload),

  /** draft to active to retired. `reason` is recorded against the change. */
  setStatus: (questionId: string, status: string, reason?: string) =>
    post<QuestionRow>(`/teaching/questions/${questionId}/status`, { status, reason }),

  remove: (questionId: string) => del(`/teaching/questions/${questionId}`),
}

/**
 * Keys, shaped so a partial key clears everything beneath it.
 *
 * Nested under one `assessment` root rather than spread across the shared
 * `qk`, because banks and questions invalidate together: adding a question
 * changes its bank's `question_count`, and a status change moves it in and out
 * of `assemblable_count`.
 */
export const assessmentKeys = {
  all: ['assessment'] as const,
  banks: () => ['assessment', 'banks'] as const,
  bankList: (params?: unknown) => ['assessment', 'banks', 'list', params] as const,
  bank: (id: string) => ['assessment', 'banks', 'detail', id] as const,
  questions: () => ['assessment', 'questions'] as const,
  questionList: (params?: unknown) => ['assessment', 'questions', 'list', params] as const,
  question: (id: string) => ['assessment', 'questions', 'detail', id] as const,
  catalogCourses: ['assessment', 'catalog', 'courses'] as const,
  catalogLevels: ['assessment', 'catalog', 'levels'] as const,
}
