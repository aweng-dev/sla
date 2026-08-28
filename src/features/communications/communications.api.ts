import { command, del, get, getPage, http, patch, post } from '@/shared/api/client'
import type { Paginated } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'
import type { AnnouncementRow } from '@/features/notifications/notifications.api'
import { humanize } from '@/shared/lib/format'
import type { TerminologyKey } from '@/shared/types/tenant.types'

/**
 * Conversations, the address book, and the noticeboard.
 *
 * ── Two halves that are deliberately not symmetrical ───────────────────────
 *
 * Announcements have a SENDING side under `admin/communications`, gated on
 * `communications.manage` and on the `staff` stack, and a RECEIVING side under
 * `portal/announcements` which carries neither. The receiving listing is a join
 * against the caller's own receipts — the rows written when the audience was
 * resolved at publication — so what somebody can read cannot drift from what
 * they were actually sent.
 *
 * Threads have no such split, and that is the point. `portal/threads` carries
 * `module:communications` and nothing more restrictive: a parent, a learner and
 * a class teacher are in the SAME conversation, and a staff-only endpoint beside
 * a family one would be two implementations of one boundary. The narrowing is
 * participation and only participation — the API answers 404 to a non-
 * participant, including the institution's owner. There is no administrative
 * route into a conversation anywhere in the API, so this client does not have
 * one either.
 *
 * ── Publishing is a POST to its own address ────────────────────────────────
 *
 * Not a PATCH that sets a status. Publication resolves an audience, writes a
 * receipt per recipient and notifies them, and it cannot be re-run — reachable
 * from an edit form, it is how somebody sends four hundred emails by fixing a
 * typo. `update` and `destroy` are DRAFTS ONLY and the API refuses them on a
 * published announcement; this client never offers them on one.
 *
 * Shapes transcribed from the controllers and resources, not guessed.
 */

/* ── Conversations ───────────────────────────────────────────────────────── */

export type ThreadKind = 'direct' | 'announcement' | 'group'
export type ThreadStatus = 'open' | 'archived'
export type ParticipantRole = 'owner' | 'participant' | 'observer'

/**
 * A conversation as ONE participant sees it.
 *
 * `unread_count`, `is_muted` and `role` are facts about this reader's
 * relationship to the thread rather than about the thread — the API builds a
 * `ThreadView` per viewer for exactly that reason, and an inbox that rendered
 * them off a shared row would show one participant another's badge.
 */
export interface ThreadRow {
  id: string
  subject: string
  kind: ThreadKind
  status: ThreadStatus
  /** The viewer's own role. `observer` cannot reply; see `can_reply`. */
  role: ParticipantRole
  last_message_at: string | null
  last_read_at: string | null
  unread_count: number
  is_muted: boolean
  /** The API's own answer, not a rule this client re-derives from role and
   *  status — the two would disagree the day either changes. */
  can_reply: boolean
  participant_user_ids: string[]
}

export interface AttachmentRow {
  id: string
  file_name: string
  /** Null for a file uploaded without one. Never a storage path: the resource
   *  refuses to emit a key, because a key in a client's hands becomes a URL
   *  that outlives the caller's membership of the thread. */
  mime_type: string | null
  size_bytes: number
  uploaded_by_user_id: string | null
}

export interface MessageRow {
  id: string
  message_thread_id: string
  /** Null on a system message — "X added Y to the conversation". */
  sender_user_id: string | null
  /**
   * Absent unless the endpoint eager-loaded the sender, which the thread and
   * the send-reply response both do. Optional rather than nullable on purpose:
   * `whenLoaded` omits the KEY, and a screen that treated a missing key as a
   * null name would caption a real person's message "Unknown".
   */
  sender_name?: string | null
  is_system: boolean
  body: string
  sent_at: string | null
  edited_at: string | null
  was_edited: boolean
  /** Absent when not loaded, for the reason `sender_name` is. */
  attachments?: AttachmentRow[]
}

/** `GET /portal/threads/{id}` puts the messages INSIDE `data` beside the view's
 *  own fields — they are part of the thing being read, not `meta` describing
 *  the reading. */
export type ThreadDetail = ThreadRow & { messages: MessageRow[] }

export interface StartThreadInput {
  subject: string
  body?: string
  participant_user_ids: string[]
  kind?: ThreadKind
  context_type?: string
  context_id?: string
}

/* ── The address book ────────────────────────────────────────────────────── */

/**
 * Somebody this account may write to.
 *
 * The list is bounded by who the caller is — a family gets their children's
 * teachers, staff get their colleagues, their learners and those learners'
 * families — and that bound is applied in the API's query rather than after it.
 * There is deliberately no single-entry lookup: one would answer "is this uuid
 * somebody at this school" for any id a client cared to try.
 */
export interface DirectoryEntry {
  user_id: string
  person_id: string | null
  /** The account's own name where the institution has no person record for
   *  them. Never an email address. */
  name: string
  /** Every answer, not the first: somebody can be staff AND a guardian. */
  kinds: string[]
  /** A staff job title, where there is one. */
  title: string | null
  guardian_of: { student_id: string; name: string | null }[]
}

export interface DirectoryParams {
  search?: string
  kind?: string
  page?: number
  per_page?: number
}

/* ── The noticeboard ─────────────────────────────────────────────────────── */

export type AnnouncementStatus = 'draft' | 'published' | 'archived'

export type AudienceKind =
  | 'whole_school'
  | 'staff'
  | 'students'
  | 'guardians'
  | 'learning_group'
  | 'course_offering'
  | 'academic_level'
  | 'program'

export type RecipientKind = 'all' | 'students' | 'guardians' | 'staff'

/**
 * An announcement as its SENDER sees it.
 *
 * The portal row and this one are the same resource; only the admin endpoints
 * count the receipts, so `recipient_count` is optional rather than a number
 * this client would otherwise have to invent as zero for every received notice.
 */
export interface ManagedAnnouncement extends AnnouncementRow {
  recipient_count?: number
}

export interface AnnouncementInput {
  title: string
  body: string
  audience_kind: AudienceKind
  audience_id?: string | null
  recipient_kind?: RecipientKind | null
  expires_at?: string | null
  is_pinned?: boolean
  /** Draft and send in one call. "Write and send" is one action to the person
   *  doing it, and two calls leave a window in which a half-made broadcast is
   *  sitting in the list. */
  publish?: boolean
}

/**
 * Counts, and never names.
 *
 * "Thirty-one people will receive this" is what a sender needs before pressing
 * send; a list of who those thirty-one are would turn a preview into an export
 * of a cohort's family contacts, and the API refuses to build one.
 */
export interface AudiencePreview {
  audience_kind: AudienceKind
  audience_id: string | null
  recipient_kind: RecipientKind
  student_count: number
  recipient_count: number
}

/* ── Client ──────────────────────────────────────────────────────────────── */

export const communicationsApi = {
  threads: () => get<ThreadRow[]>('/portal/threads'),

  thread: (id: string) => get<ThreadDetail>(`/portal/threads/${id}`),

  startThread: (input: StartThreadInput) => post<ThreadRow>('/portal/threads', input),

  sendMessage: (threadId: string, body: string) =>
    post<MessageRow>(`/portal/threads/${threadId}/messages`, { body }),

  /** Answers with a sentence rather than a record, so nothing is invented into
   *  the row from the response. */
  markThreadRead: (threadId: string) => command(`/portal/threads/${threadId}/read`),

  muteThread: (threadId: string, muted: boolean) =>
    command(`/portal/threads/${threadId}/mute`, { muted }),

  archiveThread: (threadId: string) => post<ThreadRow>(`/portal/threads/${threadId}/archive`),

  addParticipant: (threadId: string, userId: string, role?: ParticipantRole) =>
    post<ThreadRow>(`/portal/threads/${threadId}/participants`, { user_id: userId, role }),

  removeParticipant: (threadId: string, userId: string) =>
    del(`/portal/threads/${threadId}/participants/${userId}`),

  /**
   * An attachment's bytes.
   *
   * Streamed into a blob rather than opened as a URL, because the API
   * deliberately hands out no signed link: a URL outlives the caller's
   * participation in the thread and these bytes must not. The caller owns the
   * object URL and must revoke it.
   */
  async downloadAttachment(threadId: string, attachmentId: string): Promise<Blob> {
    const response = await http.get<Blob>(
      `/portal/threads/${threadId}/attachments/${attachmentId}`,
      { responseType: 'blob' },
    )
    return response.data
  },

  directory: (params: DirectoryParams): Promise<Paginated<DirectoryEntry>> =>
    getPage<DirectoryEntry>('/portal/directory', {
      params: {
        search: params.search || undefined,
        kind: params.kind || undefined,
        page: params.page,
        per_page: params.per_page,
      },
    }),

  /** What was sent TO this account. A receipts join, never a re-resolution. */
  received: () => get<AnnouncementRow[]>('/portal/announcements'),

  markAnnouncementRead: (id: string) => command(`/portal/announcements/${id}/read`),

  /** What this institution has sent, drafts included. */
  sent: (params: { status?: AnnouncementStatus; page?: number; per_page?: number }) =>
    getPage<ManagedAnnouncement>('/admin/communications/announcements', {
      params: {
        status: params.status || undefined,
        page: params.page,
        per_page: params.per_page,
      },
    }),

  createAnnouncement: (input: AnnouncementInput) =>
    post<ManagedAnnouncement>('/admin/communications/announcements', input),

  /** Drafts only — the API refuses a published one, and so does this screen. */
  updateAnnouncement: (id: string, input: Partial<AnnouncementInput>) =>
    patch<ManagedAnnouncement>(`/admin/communications/announcements/${id}`, input),

  deleteAnnouncement: (id: string) => del(`/admin/communications/announcements/${id}`),

  publishAnnouncement: (id: string) =>
    post<ManagedAnnouncement>(`/admin/communications/announcements/${id}/publish`),

  archiveAnnouncement: (id: string) =>
    post<ManagedAnnouncement>(`/admin/communications/announcements/${id}/archive`),

  audience: (id: string) =>
    get<AudiencePreview>(`/admin/communications/announcements/${id}/audience`),
}

/**
 * Cache keys.
 *
 * Under the `portal` root wherever the endpoint is, so the sign-out purge that
 * clears `qk.portal.all` clears these too. `received` re-exports the shared
 * announcements key rather than spelling a local one: the dashboards already
 * fetch that endpoint under `qk.portal.announcements()`, and a second spelling
 * would keep two copies of one answer.
 */
export const communicationKeys = {
  threadsRoot: ['portal', 'threads'] as const,
  threads: () => ['portal', 'threads', 'list'] as const,
  thread: (id: string) => ['portal', 'threads', 'detail', id] as const,
  directory: (params: DirectoryParams) => ['portal', 'directory', params] as const,
  received: qk.portal.announcements(),
  sentRoot: ['portal', 'sent-announcements'] as const,
  sent: (params: unknown) => ['portal', 'sent-announcements', params] as const,
  audience: (id: string) => ['portal', 'sent-announcements', 'audience', id] as const,
}

/* ── Labels for the values the API names ─────────────────────────────────── */

/**
 * How to WRITE an audience, in the institution's own words.
 *
 * Functions of the vocabulary rather than a static map, because three of the
 * eight name a domain concept: a school broadcasts to Students and Classes, a
 * training provider to Delegates and Cohorts. Anything the API adds later falls
 * back to `humanize`, so a new audience renders readably rather than blank.
 */
export function audienceLabel(kind: string, t: (key: TerminologyKey) => string): string {
  switch (kind) {
    case 'whole_school':
      return 'Everyone'
    case 'staff':
      return `All ${t('teachers').toLowerCase()} and staff`
    case 'students':
      return `All ${t('learners').toLowerCase()}`
    case 'guardians':
      return `All ${t('guardians').toLowerCase()}`
    case 'learning_group':
      return `One ${t('group').toLowerCase()}`
    case 'course_offering':
      return `One ${t('course').toLowerCase()} offering`
    case 'academic_level':
      return `One ${t('level').toLowerCase()}`
    case 'program':
      return `One ${t('programme').toLowerCase()}`
    default:
      return humanize(kind)
  }
}

/** Which slice of that audience actually receives it. */
export function recipientLabel(kind: string, t: (key: TerminologyKey) => string): string {
  switch (kind) {
    case 'all':
      return 'Everyone in it'
    case 'students':
      return `${t('learners')} only`
    case 'guardians':
      return `${t('guardians')} only`
    case 'staff':
      return 'Staff only'
    default:
      return humanize(kind)
  }
}

/** What somebody is at this institution, for a directory row. Plural-free —
 *  a row says what one person is. */
export function directoryKindLabel(kind: string, t: (key: TerminologyKey) => string): string {
  switch (kind) {
    case 'staff':
      return 'Staff'
    case 'student':
      return t('learner')
    case 'guardian':
      return t('guardian')
    default:
      return humanize(kind)
  }
}
