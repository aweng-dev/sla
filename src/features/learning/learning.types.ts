/**
 * Shapes for the Learning surface, transcribed from live responses after
 * seeding real records — the tables were empty, so these were verified by
 * creating an assignment, publishing it, submitting to it, marking it and
 * releasing the mark, and by opening a forum, a thread and a reply.
 *
 * ── `whenLoaded` means fields come and go ──────────────────────────────────
 *
 * The API's resources wrap several fields in `whenLoaded`/`whenCounted`, so
 * `course_title`, `set_by`, `submission_count` and `awaiting_approval` are
 * present on a listing that eager-loaded them and ABSENT — not null — on one
 * that did not. They are optional here for that reason, and every screen
 * treats absence as "not asked for" rather than "empty".
 *
 * ── Marks are hidden until released ────────────────────────────────────────
 *
 * `AssignmentSubmissionResource` computes `marksVisible` and nulls `score`,
 * `feedback`, `marked_at` and `marked_by` for a reader who should not see them
 * yet. A learner therefore gets `score: null` on a marked-but-unreleased
 * submission, which is NOT the same as unmarked — `status` is what says which.
 */

/* ── Assignments ────────────────────────────────────────────────────────── */

export const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed'] as const
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]

/** How work is handed in. Enforced by a CHECK constraint on the table, not by
 *  a PHP enum, which is why it is spelled out here. */
export const SUBMISSION_KINDS = ['text', 'file', 'link', 'offline'] as const
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number]

export interface Assignment {
  id: string
  course_offering_id: string
  /** Only when the offering and its course were eager-loaded. */
  course_title?: string | null
  course_code?: string | null
  gradebook_item_id: string | null
  gradebook_item_title?: string | null
  title: string
  instructions: string | null
  submission_kind: SubmissionKind
  max_score: number
  max_attempts: number
  opens_at: string | null
  due_at: string | null
  closes_at: string | null
  allows_late_submission: boolean
  late_penalty_percent: number | null
  status: AssignmentStatus
  status_label: string
  published_at: string | null
  /** The server's own answer, folding in status, the window and late policy.
   *  Never re-derive this from dates — a closed assignment inside its window
   *  still accepts nothing. */
  accepts_submissions_now: boolean
  is_overdue: boolean
  set_by?: string | null
  submission_count?: number
}

export const SUBMISSION_STATUSES = ['draft', 'submitted', 'marked', 'returned'] as const
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]

export interface SubmissionFile {
  id: string
  original_name: string
  mime_type: string | null
  size_bytes: number
}

export interface AssignmentSubmission {
  id: string
  assignment_id: string
  assignment_title?: string | null
  student_id: string
  student_name?: string | null
  attempt_number: number
  status: SubmissionStatus
  status_label: string
  body: string | null
  link_url: string | null
  submitted_at: string | null
  is_late: boolean
  minutes_late: number | null
  /** Null when unmarked OR when marked but not yet released to this reader. */
  score: number | null
  feedback: string | null
  marked_at: string | null
  marked_by?: string | null
  returned_at: string | null
  files?: SubmissionFile[]
}

/* ── Discussions ────────────────────────────────────────────────────────── */

export const FORUM_STATUSES = ['open', 'locked', 'archived'] as const
export type ForumStatus = (typeof FORUM_STATUSES)[number]

export interface Forum {
  id: string
  course_offering_id: string | null
  course_title?: string | null
  course_code?: string | null
  title: string
  description: string | null
  status: ForumStatus
  status_label: string
  /** Held posts wait for a moderator before anyone else sees them. */
  is_moderated: boolean
  allows_learner_threads: boolean
  /** Both derived server-side from status and settings. `can_post_now` gates
   *  replying; `can_start_thread_now` additionally respects whether learners
   *  may open threads at all. */
  can_post_now: boolean
  can_start_thread_now: boolean
  thread_count: number
  last_activity_at: string | null
  opened_by?: string | null
  awaiting_approval?: number
  created_at: string
}

export const THREAD_STATUSES = ['open', 'locked'] as const
export type ThreadStatus = (typeof THREAD_STATUSES)[number]

export interface Post {
  id: string
  thread_id: string
  parent_post_id: string | null
  /** Null on a removed post — the resource strips the author and the body
   *  rather than deleting the row, so the shape of the conversation survives
   *  moderation. */
  author_user_id: string | null
  author_name?: string | null
  body: string | null
  is_opening_post: boolean
  was_edited: boolean
  edited_at: string | null
  awaiting_approval: boolean
  approved_at: string | null
  was_removed: boolean
  removed_reason: string | null
  created_at: string
}

export interface Thread {
  id: string
  forum_id: string
  forum_title?: string | null
  title: string
  status: ThreadStatus
  status_label: string
  is_pinned: boolean
  author_user_id: string
  author_name?: string | null
  reply_count: number
  last_post_at: string | null
  created_at: string
  can_post_now: boolean
  is_following?: boolean
  has_unread?: boolean
  /** Present on a detail read; absent on a listing. */
  opening_post?: Post | null
  posts?: Post[]
}
