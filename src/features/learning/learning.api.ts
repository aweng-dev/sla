import { command, del, get, getPage, post, put } from '@/shared/api/client'
import type { Paginated } from '@/shared/api/envelope'
import { params } from '@/features/academics/academics.api'
import type {
  Assignment,
  AssignmentSubmission,
  Forum,
  Post,
  Thread,
} from './learning.types'

/**
 * Every Learning call, split by WHO may make it.
 *
 * ── Three surfaces, and the split is a profile, not a permission ───────────
 *
 * `/teaching/*` is the setting-and-marking side. It answers 200 to an
 * institution owner AND to a teacher, and 403 ACCESS_DENIED to a learner —
 * verified against all three tokens. So the gate is a staff profile, exactly
 * as it is on `/admin/*`, and screens branch on `useTenant().portal` rather
 * than on a permission a learner also holds.
 *
 * `/portal/*` is the doing side: what a learner has been set, what they
 * submitted, and the forums they can read and post in. It answers 200 to
 * everybody, narrowed to the caller.
 *
 * ── Creating an assignment is addressed to the OFFERING ────────────────────
 *
 * `POST /teaching/offerings/{offering}/assignments`, not `POST /assignments`.
 * An assignment cannot exist unattached — it is set to one class taking one
 * subject in one period — so the offering is in the path rather than the body,
 * and there is no way to create one without saying which.
 *
 * ── Marking and releasing are one call or two ──────────────────────────────
 *
 * `mark` takes an optional `release: true`, and there is a separate `/release`
 * for marks entered earlier and handed back later. Both exist because a
 * teacher marks a set over an evening and releases the whole set at once; the
 * screens offer both rather than assuming.
 */

/* ── Teaching: setting and marking ──────────────────────────────────────── */

export interface AssignmentQuery {
  course_offering_id?: string
  status?: string
  search?: string
  due_before?: string
  due_after?: string
  page?: number
  per_page?: number
}

export interface AssignmentPayload {
  title: string
  due_at: string
  instructions?: string | null
  submission_kind?: string | null
  max_score?: number | null
  max_attempts?: number | null
  opens_at?: string | null
  closes_at?: string | null
  allows_late_submission?: boolean
  late_penalty_percent?: number | null
  gradebook_item_id?: string | null
}

export interface MarkPayload {
  score?: number | null
  feedback?: string | null
  /** Hand the mark back in the same breath. Without it the submission becomes
   *  `marked` and the learner still sees nothing. */
  release?: boolean
}

export const teachingApi = {
  assignments: (query: AssignmentQuery = {}): Promise<Paginated<Assignment>> =>
    getPage<Assignment>('/teaching/assignments', { params: params(query) }),

  assignment: (id: string) => get<Assignment>(`/teaching/assignments/${id}`),

  createAssignment: (offeringId: string, payload: AssignmentPayload) =>
    post<Assignment>(`/teaching/offerings/${offeringId}/assignments`, payload),

  updateAssignment: (id: string, payload: Partial<AssignmentPayload>) =>
    put<Assignment>(`/teaching/assignments/${id}`, payload),

  removeAssignment: (id: string) => del(`/teaching/assignments/${id}`),

  /** Draft → published. Until this runs, no learner can see it at all. */
  publishAssignment: (id: string) => post<Assignment>(`/teaching/assignments/${id}/publish`),
  /** Published → closed. Stops submissions without hiding what was set. */
  closeAssignment: (id: string) => post<Assignment>(`/teaching/assignments/${id}/close`),

  submissions: (id: string, query: { page?: number; per_page?: number } = {}) =>
    getPage<AssignmentSubmission>(`/teaching/assignments/${id}/submissions`, {
      params: params(query),
    }),

  submission: (assignmentId: string, submissionId: string) =>
    get<AssignmentSubmission>(`/teaching/assignments/${assignmentId}/submissions/${submissionId}`),

  mark: (assignmentId: string, submissionId: string, payload: MarkPayload) =>
    post<AssignmentSubmission>(
      `/teaching/assignments/${assignmentId}/submissions/${submissionId}/mark`,
      payload,
    ),

  release: (assignmentId: string, submissionId: string) =>
    post<AssignmentSubmission>(
      `/teaching/assignments/${assignmentId}/submissions/${submissionId}/release`,
    ),

  /* ── Forums ─────────────────────────────────────────────────────────── */

  forums: () => get<Forum[]>('/teaching/forums'),

  createForum: (payload: {
    title: string
    description?: string | null
    course_offering_id?: string | null
    is_moderated?: boolean
    allows_learner_threads?: boolean
  }) => post<Forum>('/teaching/forums', payload),

  updateForum: (id: string, payload: Record<string, unknown>) =>
    put<Forum>(`/teaching/forums/${id}`, payload),

  removeForum: (id: string) => del(`/teaching/forums/${id}`),

  /** Posts held back by moderation, waiting for a decision. */
  moderation: (id: string) => get<Post[]>(`/teaching/forums/${id}/moderation`),

  /** open / locked / archived. A named transition, not a status write. */
  setForumStatus: (id: string, status: string) =>
    post<Forum>(`/teaching/forums/${id}/status`, { status }),

  setThreadState: (threadId: string, payload: { status?: string; is_pinned?: boolean }) =>
    post<Thread>(`/teaching/threads/${threadId}/state`, payload),
}

/* ── Portal: what a learner has been set ────────────────────────────────── */

export const portalLearningApi = {
  assignments: (query: { page?: number; per_page?: number } = {}) =>
    getPage<Assignment>('/portal/assignments', { params: params(query) }),

  assignment: (id: string) => get<Assignment>(`/portal/assignments/${id}`),

  /** A learner's own attempts at one assignment — `max_attempts` is why this
   *  is a list rather than a single record. */
  submissions: (assignmentId: string) =>
    get<AssignmentSubmission[]>(`/portal/assignments/${assignmentId}/submissions`),

  submit: (assignmentId: string, payload: { body?: string | null; link_url?: string | null }) =>
    post<AssignmentSubmission>(`/portal/assignments/${assignmentId}/submissions`, payload),

  /* ── Discussions ────────────────────────────────────────────────────── */

  forums: () => get<Forum[]>('/portal/discussions'),

  forum: (id: string) => get<Forum>(`/portal/discussions/forums/${id}`),

  threads: (forumId: string, query: { page?: number; per_page?: number } = {}) =>
    getPage<Thread>(`/portal/discussions/forums/${forumId}/threads`, { params: params(query) }),

  startThread: (forumId: string, payload: { title: string; body: string }) =>
    post<Thread>(`/portal/discussions/forums/${forumId}/threads`, payload),

  /** Returns the thread WITH its posts; the listing above carries neither. */
  thread: (threadId: string) => get<Thread>(`/portal/discussions/threads/${threadId}`),

  reply: (threadId: string, payload: { body: string; parent_post_id?: string | null }) =>
    post<Post>(`/portal/discussions/threads/${threadId}/posts`, payload),

  editPost: (postId: string, body: string) => put<Post>(`/portal/discussions/posts/${postId}`, { body }),

  follow: (threadId: string) => command(`/portal/discussions/threads/${threadId}/follow`),
}
