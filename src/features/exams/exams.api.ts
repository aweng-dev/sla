import { get, getPage, post, put } from '@/shared/api/client'

/**
 * Sitting a test, as the candidate does it.
 *
 * ── Nothing here can ask for the answer key ────────────────────────────────
 *
 * Not because this client is careful, but because the endpoints have no field
 * for one. `ExamResource` never names `answer_key`; the paper a candidate sees
 * comes from a snapshot frozen onto their own attempt at the moment it started,
 * and each option carries id, content and sequence because nothing else exists
 * on those rows. `is_correct` and `explanation` arrive only once the sitting has
 * been released AND the paper reveals answers — the server decides both, and
 * sends null otherwise.
 *
 * So there is no defensive filtering to do on this side, and none is attempted:
 * pretending to strip a field the payload never carries would suggest the
 * protection lives here.
 *
 * ── The clock belongs to the server ────────────────────────────────────────
 *
 * Every attempt payload carries `seconds_remaining`, computed from the row's
 * own `expires_at` at render time, and `server_time` beside it. A client ticks
 * locally between refreshes and re-syncs on every save — it never computes the
 * deadline from `expires_at` against its own clock, because a candidate's
 * device clock is the one clock in the system nobody controls.
 *
 * ── A late hand-in is accepted, flagged, and measured ──────────────────────
 *
 * `is_late` and `seconds_late` come back on the attempt. Refusing a late
 * submission would destroy a candidate's paper along with the evidence, so the
 * server takes it and says so — and this client reports what it was told.
 */

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' | 'matching'

export type AttemptStatus = 'in_progress' | 'submitted' | 'marked' | 'released' | 'abandoned'

/** One option as this candidate was shown it, in the order they saw it. */
export interface AskedOption {
  id: string
  content: string
  sequence: number
}

/**
 * What a candidate has put, shaped by the question type.
 *
 * One key per type, and the API validates exactly these. `null` is a cleared
 * answer, which is different from an unanswered one only in that somebody
 * touched it — both are unanswered as far as marking is concerned.
 */
export interface AnswerResponse {
  /** multiple_choice */
  option_id?: string | null
  /** true_false */
  value?: boolean | null
  /** short_answer, essay */
  text?: string | null
  /** matching — left option id to right option id. */
  pairs?: Record<string, string | null>
}

export interface AttemptAnswer {
  id: string
  sequence: number
  type: QuestionType | null
  prompt: string | null
  section: string | null
  options: AskedOption[]
  /** The right-hand column of a matching question, already shuffled. */
  match_options: AskedOption[]
  max_score: number
  response: AnswerResponse | null
  answered_at: string | null
  /** Null until the sitting is released — and null on an unmarked answer for
   *  everybody, because an essay awaiting a person has no score rather than a
   *  score of zero. */
  score: number | null
  is_marked: boolean
  awaiting_marking: boolean
  feedback: string | null
  /** Only where the sitting is released and the paper reveals answers. */
  is_correct: boolean | null
  explanation: string | null
}

export interface ExamAttempt {
  id: string
  exam_id: string
  exam_title: string | null
  student_id: string
  student_name: string | null
  attempt_number: number
  status: AttemptStatus
  status_label: string
  started_at: string | null
  expires_at: string | null
  /** The server's own countdown at render time. Null on an untimed paper. */
  seconds_remaining: number | null
  /** What the server's clock said when it built this payload. */
  server_time: string
  submitted_at: string | null
  submitted_via: string | null
  is_late: boolean
  seconds_late: number | null
  max_score: number | null
  score: number | null
  percentage: number | null
  /** Something on this paper needs a person to read it. */
  awaiting_marking: boolean
  unmarked_count: number
  released_at: string | null
  answers?: AttemptAnswer[]
}

export interface Exam {
  id: string
  course_offering_id: string | null
  course_title: string | null
  course_code: string | null
  gradebook_item_id: string | null
  gradebook_item_title: string | null
  title: string
  instructions: string | null
  status: string
  status_label: string
  published_at: string | null
  opens_at: string | null
  closes_at: string | null
  duration_minutes: number | null
  is_timed: boolean
  max_attempts: number
  attempt_grading: string
  attempt_grading_label: string
  questions_to_serve: number | null
  results_visibility: string
  results_visibility_label: string
  reveals_correct_answers: boolean
  passing_score_percent: number | null
  allows_late_submission: boolean
  /**
   * The server's answer to "may I start now", computed from the window, the
   * status and the clock. Never re-derived here from `opens_at`/`closes_at`:
   * a client that worked it out itself would show an enabled button and then
   * a 409, which on an exam screen reads as the system losing the paper.
   */
  accepts_attempts_now: boolean
  set_by: string | null
  question_count: number | null
  attempt_count: number | null
}

export const examsApi = {
  /** The tests this candidate has been set. Drafts are excluded server-side —
   *  a draft exam is the questions. */
  exams: (params: { open_only?: boolean; student_id?: string; page?: number } = {}) =>
    getPage<Exam>('/portal/exams', {
      params: {
        open_only: params.open_only ? 1 : undefined,
        student_id: params.student_id || undefined,
        page: params.page,
      },
    }),

  /** One paper, without its questions. */
  exam: (id: string) => get<Exam>(`/portal/exams/${id}`),

  /** This candidate's own sittings of it. Unpaginated: there are one or three
   *  of these, never four hundred. */
  attempts: (examId: string, studentId?: string) =>
    get<ExamAttempt[]>(`/portal/exams/${examId}/attempts`, {
      params: { student_id: studentId || undefined },
    }),

  /**
   * Begin a sitting.
   *
   * The paper is frozen onto the attempt here — which questions, in which
   * order, and the deadline. Refused with a 409 and a sentence when the paper
   * is shut, the attempt limit is used up, or a sitting is already in progress.
   */
  start: (examId: string) => post<ExamAttempt>(`/portal/exams/${examId}/attempts`),

  /** A sitting in progress, with the paper as this candidate is being asked it. */
  attempt: (attemptId: string) => get<ExamAttempt>(`/portal/exam-attempts/${attemptId}`),

  /**
   * Record one answer.
   *
   * Answers with the whole attempt, which is how the countdown re-syncs: every
   * save is a fresh `seconds_remaining` from the server, so a candidate's clock
   * cannot drift far from the one that will actually close the paper.
   */
  saveAnswer: (attemptId: string, answerId: string, response: AnswerResponse | null) =>
    put<ExamAttempt>(`/portal/exam-attempts/${attemptId}/answers/${answerId}`, { response }),

  /** Hand it in. Late is accepted, flagged and measured — see the file note. */
  submit: (attemptId: string) => post<ExamAttempt>(`/portal/exam-attempts/${attemptId}/submit`),
}

export const examKeys = {
  root: ['portal', 'exams'] as const,
  list: (params: unknown) => ['portal', 'exams', 'list', params] as const,
  exam: (id: string) => ['portal', 'exams', 'detail', id] as const,
  attempts: (examId: string) => ['portal', 'exams', examId, 'attempts'] as const,
  attempt: (id: string) => ['portal', 'exam-attempts', id] as const,
}

/** How many of a paper's questions have something recorded against them. */
export function answeredCount(attempt: ExamAttempt): number {
  return (attempt.answers ?? []).filter((answer) => hasResponse(answer.response)).length
}

/**
 * Whether an answer holds anything.
 *
 * A cleared radio, an empty essay box and an untouched question are all
 * unanswered — `answered_at` is not the test, because a candidate who typed and
 * then deleted has a timestamp and no answer.
 */
export function hasResponse(response: AnswerResponse | null | undefined): boolean {
  if (!response) return false
  if (response.option_id) return true
  if (typeof response.value === 'boolean') return true
  if (typeof response.text === 'string' && response.text.trim() !== '') return true
  if (response.pairs && Object.values(response.pairs).some(Boolean)) return true
  return false
}
