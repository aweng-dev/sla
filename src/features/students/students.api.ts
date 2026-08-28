import { del, get, getPage, http, post, put, PER_PAGE_DEFAULT } from '@/shared/api/client'
import { qk } from '@/shared/api/queryKeys'
import type {
  CatalogGroup,
  CatalogLevel,
  CatalogProgram,
  CatalogSession,
  GuardianLink,
  InvoiceRow,
  SessionEnrollmentRow,
  PortalStudentRecord,
  StudentBalance,
  StudentRecord,
  StudentRollSummary,
  StudentRow,
  StudentConduct,
  BehaviourRecord,
  EmergencySummary,
} from './students.types'

/**
 * Every students call in one place.
 *
 * ── Only four filters exist ────────────────────────────────────────────────
 *
 * `GET /admin/students` reads `status`, `program_id`, `learning_group_id` and
 * `search`, and nothing else (plus `custom[…]` for the institution's own
 * fields). `academic_session_id` is NOT among them — passing it changes no
 * row, which is the worst kind of filter: one that reports a narrowing it did
 * not do. So it is not offered, here or on the screen.
 *
 * ── The photograph is bytes, not a link ────────────────────────────────────
 *
 * `person.has_photo` is a flag; `/admin/students/{id}/photo` streams the image
 * behind the same permission the record asks for and deliberately hands out no
 * URL, so a child's face cannot outlive the session that fetched it. That is
 * why `photo` goes through the axios instance directly for a blob rather than
 * through `get`, which unwraps an envelope this endpoint does not send.
 *
 * ── Two families, and the gate between them ────────────────────────────────
 *
 * Everything in `studentsApi` is `/admin/*` and needs a STAFF profile. Not a
 * permission — a profile. A learner and a guardian both hold `students.view`
 * and both get 403 from every route below, including `/admin/students/{id}`
 * for their own or their own child's record. `portalApi` is what those two
 * readers may call instead; the screens branch on `useTenant().portal`.
 */

/**
 * ── The lifecycle actions, and why none of them is a status write ─────────
 *
 * Promote, transfer, withdraw and graduate are four POSTs to named sub-routes,
 * and every one of them does domain work beyond setting a column: graduating
 * ends every open session, programme and period enrolment, drops the course
 * registrations and closes the learning-group membership. `PUT /admin/students/{id}`
 * does NOT accept `status` — it takes the person's details and their numbers
 * and nothing else — so there is no way to reach these outcomes by editing,
 * and no way back from one either. There is no un-graduate endpoint.
 *
 * That asymmetry is the reason every one of these is behind a confirmation
 * that says what it will do, rather than a menu item that just fires.
 */

export interface PromotePayload {
  academic_session_id: string
  academic_level_id?: string | null
  /** Held back rather than moved up. The server records the outcome either
   *  way — a repeat is a promotion decision, not the absence of one. */
  repeat?: boolean
}

export interface PromoteResult {
  student_id: string
  academic_session_id: string | null
  promotion_status: string
  promoted_to_academic_level_id: string | null
}

export interface TransferPayload {
  reason: string
  /** One of the two is required; the API validates them as
   *  `required_without` each other. */
  to_campus_id?: string | null
  to_program_id?: string | null
  academic_level_id?: string | null
  academic_session_id?: string | null
  curriculum_version_id?: string | null
}

export interface WithdrawPayload {
  reason: string
  withdrawn_on?: string | null
}

export interface GraduatePayload {
  graduated_on?: string | null
}

export interface UpdateStudentPayload {
  person?: {
    first_name?: string
    middle_name?: string | null
    last_name?: string
    preferred_name?: string | null
    date_of_birth?: string | null
    gender?: string | null
    nationality_code?: string | null
  }
  student_number?: string | null
  admission_number?: string | null
  admission_date?: string | null
}

export interface LinkGuardianPayload {
  guardian_id: string
  relationship_type: string
  is_legal_guardian?: boolean
  has_financial_responsibility?: boolean
  can_pick_up?: boolean
  emergency_priority?: number | null
  receives_academic_notifications?: boolean
  receives_financial_notifications?: boolean
  notes?: string | null
}

/** `POST /admin/students/{id}/photo` takes multipart with the field named
 *  `photo`: an image, png/jpg/jpeg/webp, at most 8 MB, between 100 and 6000
 *  pixels on each side. Checked here before sending so a phone photo that is
 *  too large fails in the dialog rather than after the upload. */
export const PHOTO_RULES = {
  accept: 'image/png,image/jpeg,image/webp',
  maxBytes: 8 * 1024 * 1024,
  minPixels: 100,
  maxPixels: 6000,
} as const

export const STUDENT_STATUSES = ['active', 'graduated', 'transferred', 'withdrawn'] as const

export type StudentStatus = (typeof STUDENT_STATUSES)[number]

export interface StudentListQuery {
  search?: string
  status?: string
  program_id?: string
  learning_group_id?: string
  page?: number
  per_page?: number
}

/** What the summary can be narrowed by. `status` is absent on purpose: the
 *  tabs are a status breakdown, and a breakdown filtered by the thing it
 *  counts would report the tab you are standing on and zero everywhere else. */
export type StudentSummaryQuery = Omit<StudentListQuery, 'status' | 'page' | 'per_page'>

export interface AdmitStudentPayload {
  person: {
    first_name: string
    last_name: string
    middle_name?: string
    preferred_name?: string
    date_of_birth?: string
    gender?: string
  }
  admission_number?: string
  admission_date?: string
  academic_session_id?: string
  program_id?: string
  academic_level_id?: string
  learning_group_id?: string
}

export const studentsApi = {
  list: (query: StudentListQuery) =>
    getPage<StudentRow>('/admin/students', {
      params: { per_page: PER_PAGE_DEFAULT, ...query },
    }),

  /* The two breakdowns are indexed by key the moment they land — `by_status`
   * drives the status tab counts — so an absent map is a TypeError rather
   * than a missing number. Normalized here, once, instead of at each index. */
  summary: async (query: StudentSummaryQuery): Promise<StudentRollSummary> => {
    const data = await get<Partial<StudentRollSummary>>('/admin/students/statistics', {
      params: query,
    })
    return {
      total: data?.total ?? 0,
      on_roll: data?.on_roll ?? 0,
      by_status: data?.by_status ?? {},
      by_gender: data?.by_gender ?? {},
    }
  },

  detail: (studentId: string) => get<StudentRecord>(`/admin/students/${studentId}`),

  /** 201 with the whole record, placement included when one was given. Only
   *  the two names are required — the API treats a student admitted before
   *  their class is decided as a real state rather than an incomplete one. */
  admit: (payload: AdmitStudentPayload) => post<StudentRecord>('/admin/students', payload),

  /* ── Editing ───────────────────────────────────────────────────────── */

  /** The person's details and their numbers. NOT status — that is what the
   *  lifecycle actions below are for, and sending it here is silently
   *  ignored rather than refused, which is the worst of both. */
  update: (studentId: string, payload: UpdateStudentPayload) =>
    put<StudentRecord>(`/admin/students/${studentId}`, payload),

  remove: (studentId: string) => del(`/admin/students/${studentId}`),

  /* ── Lifecycle ─────────────────────────────────────────────────────── */

  /** Moves the learner up a level for a session — or holds them back, which
   *  the API records as an outcome rather than as nothing happening. Answers
   *  a summary, not the student record. */
  promote: (studentId: string, payload: PromotePayload) =>
    post<PromoteResult>(`/admin/students/${studentId}/promote`, payload),

  /** To another campus or another programme. `reason` is required and is
   *  kept — a transfer is a thing somebody has to be able to explain later. */
  transfer: (studentId: string, payload: TransferPayload) =>
    post<StudentRecord>(`/admin/students/${studentId}/transfer`, payload),

  withdraw: (studentId: string, payload: WithdrawPayload) =>
    post<StudentRecord>(`/admin/students/${studentId}/withdraw`, payload),

  /**
   * Ends every open enrolment, drops the course registrations and closes the
   * learning-group membership, then stamps the leaving date.
   *
   * IRREVERSIBLE through the API — there is no inverse endpoint, and
   * `PUT /admin/students/{id}` cannot set the status back. Anything calling
   * this must confirm first.
   */
  graduate: (studentId: string, payload: GraduatePayload = {}) =>
    post<StudentRecord>(`/admin/students/${studentId}/graduate`, payload),

  /* ── Photograph ────────────────────────────────────────────────────── */

  uploadPhoto: async (studentId: string, file: File): Promise<void> => {
    const body = new FormData()
    body.append('photo', file)
    /* Content-Type is deliberately unset: the browser has to add the multipart
     * boundary, and the client's JSON default would replace it. */
    await http.post(`/admin/students/${studentId}/photo`, body, {
      headers: { 'Content-Type': undefined as unknown as string },
    })
  },

  removePhoto: (studentId: string) => del(`/admin/students/${studentId}/photo`),

  /* ── Guardians ─────────────────────────────────────────────────────── */

  linkGuardian: (studentId: string, payload: LinkGuardianPayload) =>
    post<GuardianLink>(`/admin/students/${studentId}/guardians`, payload),

  /* ── Pastoral ──────────────────────────────────────────────────────── */

  /**
   * Conduct and health sit on their own surfaces (`/discipline/*`, `/health/*`)
   * rather than under `/admin/students`, because they are gated on their own
   * modules and answer to a different set of readers. They are reached from
   * the student record all the same — a form tutor asking "how is this child
   * doing" is asking one question.
   */
  conduct: (studentId: string) =>
    get<StudentConduct>(`/discipline/students/${studentId}/conduct`),

  behaviour: (studentId: string) =>
    get<BehaviourRecord[]>(`/discipline/students/${studentId}/behaviour-records`),

  emergency: (studentId: string) =>
    get<EmergencySummary>(`/health/students/${studentId}/emergency-summary`),

  photo: async (studentId: string): Promise<Blob> => {
    const response = await http.get<Blob>(`/admin/students/${studentId}/photo`, {
      responseType: 'blob',
    })
    return response.data
  },

  guardians: (studentId: string) =>
    get<GuardianLink[]>(`/admin/students/${studentId}/guardians`),

  /** Placement history: one row per session the student has been enrolled for. */
  enrollments: (studentId: string) =>
    getPage<SessionEnrollmentRow>('/admin/enrollments', {
      params: { student_id: studentId, per_page: 50 },
    }),

  balance: (studentId: string) =>
    get<StudentBalance>(`/admin/finance/students/${studentId}/balance`),

  invoices: (studentId: string) =>
    getPage<InvoiceRow>('/admin/finance/invoices', {
      params: { student_id: studentId, per_page: 25 },
    }),
}

/**
 * What a learner and a guardian may ask about a student record.
 *
 * `/portal/my-record` is the whole entitlement: it returns the records this
 * caller is allowed to see and nothing else, already carrying person,
 * programme, level, groups and both enrolments. There is no `/portal/…/{id}`
 * to fetch one by id, and that is the point — a record screen for these
 * readers resolves the id against this array rather than asking the server for
 * an arbitrary student, which is why no id from a URL can reach another
 * family's child.
 */
export const portalApi = {
  /** An ARRAY for everybody: one entry for a learner, one per child for a
   *  guardian. */
  myRecord: () => get<PortalStudentRecord[]>('/portal/my-record'),

  /** `student_id` is how a guardian names a child; the API intersects it with
   *  the ids they are authorized for, so it narrows and never reaches. It is
   *  sent for a learner too, who has exactly one — without it the endpoint
   *  answers 404 for a guardian rather than picking a child, and a call that
   *  is right for one reader and 404 for the other is not worth the branch. */
  balance: (studentId: string) =>
    get<StudentBalance>('/portal/finance/balance', { params: { student_id: studentId } }),

  /** A bare array — this listing sends no `meta.pagination`, so there is no
   *  page to ask for and `get` is the honest call. */
  invoices: (studentId: string) =>
    get<InvoiceRow[]>('/portal/finance/invoices', {
      params: { student_id: studentId, per_page: 25 },
    }),
}

/** Shaped to nest under the branches `qk.portal` already owns, and to match
 *  the keys the guardian's dashboard uses for the same two requests — so a
 *  parent who opens a child's record from the dashboard reads the balance the
 *  dashboard already fetched instead of fetching it again. */
export const portalKeys = {
  balance: (studentId: string) => [...qk.portal.balance(), studentId] as const,
  invoices: (studentId: string) => qk.portal.invoices(studentId),
}

/** The thin lookups the filters and the admission form choose from. These are
 *  bare arrays, not pages — the catalog endpoints answer with a capped list
 *  and a `meta.truncated` flag rather than pagination. */
export const catalogApi = {
  programs: () => get<CatalogProgram[]>('/admin/catalog/programs'),
  groups: () => get<CatalogGroup[]>('/admin/catalog/learning-groups'),
  levels: () => get<CatalogLevel[]>('/admin/catalog/academic-levels'),
  sessions: () => get<CatalogSession[]>('/admin/catalog/academic-sessions'),
}

/**
 * Keys for the things `qk.students` does not name.
 *
 * Built on top of `qk.students.detail(id)` rather than beside it, so
 * `invalidateQueries({ queryKey: qk.students.all })` still clears a student's
 * guardians and invoices along with the record they hang off.
 */
export const studentKeys = {
  guardians: (id: string) => [...qk.students.detail(id), 'guardians'] as const,
  enrollments: (id: string) => [...qk.students.detail(id), 'enrollments'] as const,
  balance: (id: string) => [...qk.students.detail(id), 'balance'] as const,
  invoices: (id: string) => [...qk.students.detail(id), 'invoices'] as const,
  photo: (id: string) => [...qk.students.detail(id), 'photo'] as const,
}

export const catalogKeys = {
  programs: ['catalog', 'programs'] as const,
  groups: ['catalog', 'learning-groups'] as const,
  levels: ['catalog', 'academic-levels'] as const,
  sessions: ['catalog', 'academic-sessions'] as const,
}
