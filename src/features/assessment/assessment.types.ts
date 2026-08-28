/**
 * The question bank domain, transcribed from the API's own resources and
 * confirmed by creating one question of every type against the live server.
 *
 * ── A question is not its text ─────────────────────────────────────────────
 *
 * The wording, the marks, the explanation, the options and the answer key all
 * live on a VERSION. The question itself carries only what survives a rewrite:
 * which bank it is in, its type, its difficulty, its status and its tags. So a
 * paper sat last term still shows the wording that was sat, and correcting a
 * typo does not silently change a mark somebody already earned.
 *
 * `current_version` is what an editor shows. `versions` is the history, and is
 * only sent when the detail endpoint is asked for.
 */

export const QUESTION_TYPES = [
  'multiple_choice',
  'true_false',
  'short_answer',
  'essay',
  'matching',
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

export const QUESTION_DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number]

/** `draft` is being written, `active` may be put on a paper, `retired` is kept
 *  for the record but never assembled again. */
export const QUESTION_STATUSES = ['draft', 'active', 'retired'] as const
export type QuestionStatus = (typeof QUESTION_STATUSES)[number]

export const BANK_STATUSES = ['active', 'archived'] as const
export type BankStatus = (typeof BANK_STATUSES)[number]

/**
 * One choice, or one half of a matching pair.
 *
 * `is_correct` and `match_key` are STAFF-facing. The learner's endpoint sends
 * a snapshot with both stripped, which is why nothing in this app may pass a
 * question payload through to a learner surface.
 */
export interface QuestionOption {
  id: string
  content: string
  sequence: number
  is_correct: boolean
  match_key: string | null
  feedback: string | null
}

/**
 * The marking rule, discriminated by `kind` — the API derives it from the
 * question's type rather than taking it as input:
 *
 *   multiple_choice → `option`   the correct options carry the answer
 *   true_false      → `boolean`  `value`
 *   short_answer    → `text`     `accepted[]`, with `case_sensitive`
 *   matching        → `pairs`    the options' `match_key`s carry the answer
 *   essay           → `manual`   marked by a person
 */
export interface AnswerKey {
  kind: 'option' | 'boolean' | 'text' | 'pairs' | 'manual'
  value?: boolean
  accepted?: string[]
  case_sensitive?: boolean
  partial_credit?: boolean
  [key: string]: unknown
}

export interface QuestionVersion {
  id: string
  question_id: string
  version_number: number
  prompt: string
  explanation: string | null
  points: number
  answer_key: AnswerKey | null
  settings: Record<string, unknown> | null
  is_current: boolean
  created_at: string | null
  written_by?: string | null
  options?: QuestionOption[]
}

export interface QuestionRow {
  id: string
  question_bank_id: string
  bank_name?: string | null
  type: QuestionType
  type_label: string
  /** Derived from the type. False only for `essay`, which a person marks. */
  is_auto_markable: boolean
  difficulty: QuestionDifficulty
  difficulty_label: string
  status: QuestionStatus
  status_label: string
  topic: string | null
  outcome_code: string | null
  tags: string[]
  /** Whether it may be put on a paper: `active` AND carrying a usable key. */
  is_assemblable: boolean
  written_by?: string | null
  created_at: string | null
  updated_at: string | null
  current_version?: QuestionVersion | null
  versions?: QuestionVersion[]
  version_count?: number
}

export interface QuestionBankRow {
  id: string
  name: string
  code: string | null
  description: string | null
  course_id: string | null
  course_title?: string | null
  course_code?: string | null
  academic_level_id: string | null
  academic_level?: string | null
  /** Shared banks are visible to every teacher; private ones to their owner. */
  is_shared: boolean
  status: BankStatus
  status_label: string
  owner_staff_id: string | null
  owner?: string | null
  /** Both are `whenCounted` — present on the list, absent on a bare detail. */
  question_count?: number
  assemblable_count?: number
  created_at: string | null
  updated_at: string | null
}

export type QuestionBankRecord = QuestionBankRow

/* ── Write payloads ──────────────────────────────────────────────────────── */

export interface BankPayload {
  name: string
  code?: string | null
  description?: string | null
  course_id?: string | null
  academic_level_id?: string | null
  is_shared?: boolean
}

export interface QuestionOptionPayload {
  content: string
  is_correct?: boolean
  match_key?: string | null
  feedback?: string | null
  sequence?: number
}

/**
 * One question, or one revision of it — the same body serves both endpoints.
 *
 * Which half of it matters depends on `type`: choices and matching send
 * `options`, true/false sends `answer_key.value`, short answer sends
 * `answer_key.accepted` with `settings.case_sensitive`, and an essay sends
 * neither because a person marks it.
 */
export interface QuestionPayload {
  type: QuestionType
  prompt: string
  explanation?: string | null
  points?: number
  difficulty?: QuestionDifficulty
  topic?: string | null
  outcome_code?: string | null
  tags?: string[]
  options?: QuestionOptionPayload[]
  answer_key?: { value?: boolean; accepted?: string[] }
  settings?: { case_sensitive?: boolean; partial_credit?: boolean }
}
