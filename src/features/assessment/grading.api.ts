import { get, getPage, post, put } from '@/shared/api/client'

/**
 * The institution's marking policy: what a mark is out of, what it has to
 * reach, and what it is then called.
 *
 * ── Two modules over one record ────────────────────────────────────────────
 *
 * The SCHEME and its scale answer to `module:grading` — what 65 is called,
 * whether 45 passes. Its CATEGORIES answer to `module:assessments` — that the
 * final mark is 40% coursework and 60% exam. An institution can run continuous
 * assessment without letter grades, and letter grades with a single unweighted
 * total, so buying one must not require the other. The two calls below carry
 * different gates for exactly that reason.
 *
 * ── The scale is written whole, and the categories are written whole ───────
 *
 * Every mark must fall in exactly one band, which is a property of the SET.
 * Sent one row at a time, every intermediate state is invalid — B and C both
 * claiming 65 — and the API would have to accept it. So both are PUTs of the
 * entire list.
 *
 * The difference between them is ids. A band carries no history anybody reads,
 * so the scale is replaced wholesale. A CATEGORY is pointed at:
 * `gradebook_items.assessment_category_id` is how an assessment knows which
 * share of the mark it belongs to. Send a category back WITH its id and it is
 * updated in place; drop the id and the server would have to recreate it,
 * nulling every item's category and silently moving all of them into the
 * unweighted remainder. So this client always round-trips the id.
 */

export type SchemeStatus = 'active' | 'archived'
export type RoundingMode = 'half_up' | 'half_down' | 'up' | 'down'
export type CalculationMode = 'weighted_categories' | 'total_points' | 'highest_score'

export interface GradingBand {
  id: string
  grading_scheme_id: string
  label: string
  description: string | null
  remark: string | null
  /** Both ends inclusive. A scale written 60–69 then 70–100 leaves 69.6
   *  unclaimed, and the server drops such a mark to the highest band whose
   *  floor it clears — so never render this as a half-open range. */
  min_score: number
  max_score: number
  grade_point: number | null
  is_passing: boolean
  /** Highest band first — the order the server matches in. */
  sequence: number
}

export interface AssessmentCategoryRow {
  id: string
  grading_scheme_id: string
  name: string
  code: string | null
  kind: string | null
  weight_percent: number
  aggregation: string
  drop_lowest_count: number
  max_score: number | null
  sequence: number
  /** How many gradebook items sit in this category. A category with items
   *  cannot be removed — the server refuses to orphan them. */
  item_count?: number
}

export interface GradingScheme {
  id: string
  name: string
  code: string | null
  program_id: string | null
  academic_level_id: string | null
  academic_session_id: string | null
  /** The server's own sentence for what this scheme narrows to. */
  applies_to: string
  calculation_mode: CalculationMode
  max_score: number
  pass_mark: number | null
  uses_grade_points: boolean
  grade_point_max: number | null
  is_credit_weighted: boolean
  rounding_mode: RoundingMode
  decimal_places: number
  is_default: boolean
  status: SchemeStatus
  band_count?: number
  category_count?: number
  /**
   * Whether this scheme can actually put a letter on a mark. A scheme with no
   * bands grades nothing — every mark lands with no letter, no grade point and
   * no pass flag — and that is a real state a scheme sits in between being
   * created and having its scale written.
   */
  is_usable: boolean
  /** Present when the categories were loaded. Reported, never enforced: the
   *  server rescales across whatever carried marks, so 90 is a working total. */
  weight_total?: number
  bands?: GradingBand[]
  categories?: AssessmentCategoryRow[]
  created_at: string | null
}

export interface SchemeInput {
  name: string
  code?: string | null
  program_id?: string | null
  academic_level_id?: string | null
  academic_session_id?: string | null
  calculation_mode?: CalculationMode
  max_score?: number
  pass_mark?: number | null
  uses_grade_points?: boolean
  grade_point_max?: number | null
  is_credit_weighted?: boolean
  rounding_mode?: RoundingMode
  decimal_places?: number
}

export interface BandInput {
  label: string
  description?: string | null
  remark?: string | null
  min_score: number
  max_score: number
  grade_point?: number | null
  is_passing?: boolean
}

export interface CategoryInput {
  /** Round-trip it. Dropping it recreates the category and orphans every
   *  assessment pointing at the old one. */
  id?: string
  name: string
  code?: string | null
  kind?: string | null
  weight_percent: number
  aggregation?: string
  drop_lowest_count?: number
  max_score?: number | null
}

const ROOT = '/admin/grading-schemes'

export const gradingApi = {
  schemes: (params: { status?: SchemeStatus | ''; search?: string; page?: number }) =>
    getPage<GradingScheme>(ROOT, {
      params: {
        status: params.status || undefined,
        search: params.search || undefined,
        page: params.page,
      },
    }),

  scheme: (id: string) => get<GradingScheme>(`${ROOT}/${id}`),

  createScheme: (input: SchemeInput) => post<GradingScheme>(ROOT, input),

  updateScheme: (id: string, input: SchemeInput) => put<GradingScheme>(`${ROOT}/${id}`, input),

  /** Overlapping bands and a scale that never reaches 0 come back as a 409
   *  naming what collided. */
  replaceScale: (id: string, bands: BandInput[]) =>
    put<GradingScheme>(`${ROOT}/${id}/scale`, { bands }),

  /** Demotes whichever scheme held the flag. There is deliberately no way to
   *  leave the institution without one. */
  setDefault: (id: string) => post<GradingScheme>(`${ROOT}/${id}/default`),

  archive: (id: string) => post<GradingScheme>(`${ROOT}/${id}/archive`),

  categories: (id: string) => get<AssessmentCategoryRow[]>(`${ROOT}/${id}/categories`),

  /** Answers with the SCHEME, because `weight_total` is a fact about the set. */
  replaceCategories: (id: string, categories: CategoryInput[]) =>
    put<GradingScheme>(`${ROOT}/${id}/categories`, { categories }),
}

export const gradingKeys = {
  root: ['admin', 'grading-schemes'] as const,
  schemes: (params: unknown) => ['admin', 'grading-schemes', 'list', params] as const,
  scheme: (id: string) => ['admin', 'grading-schemes', 'detail', id] as const,
}
