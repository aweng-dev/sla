import { del, get, getPage, http, patch, post, put } from '@/shared/api/client'

/**
 * The funnel: an intake, the people who apply to it, and what happens to each.
 *
 * ── The pipeline is a sequence of ACTS, not a status field ─────────────────
 *
 * `submit`, `reject`, `withdraw`, `offer`, `accept`, `decline`, `convert` are
 * each a POST to their own address, and none of them is a PATCH that writes
 * `status`. Every one does more than change a word: submitting freezes the
 * choices and starts the clock, an offer writes an offer record with its own
 * expiry, and converting creates a PERSON and a STUDENT from an applicant. A
 * form that set `status: enrolled` would produce an enrolled application with
 * nobody on the roll.
 *
 * ── Conversion is the only irreversible one, and it is idempotent ──────────
 *
 * `POST .../convert` answers 201 the first time and 200 with
 * `was_already_converted: true` after that, returning the same student. So a
 * double-click cannot create two learners from one offer, and this client
 * reports which of the two happened rather than claiming a new student each
 * time.
 *
 * ── The checklist is resolved server-side ──────────────────────────────────
 *
 * Required documents live on the CYCLE, and what has been uploaded and verified
 * lives on the application. `GET .../checklist` joins the two and says which
 * requirements are satisfied. A screen that compared `cycle.required_documents`
 * against `application.documents` itself would be a second implementation of the
 * rule, and the one that goes stale when "verified" stops meaning "satisfied".
 *
 * Shapes transcribed from the resources, not guessed.
 */

export type CycleStatus = 'draft' | 'open' | 'closed' | 'archived'

export type ApplicantStatus =
  | 'prospect'
  | 'applying'
  | 'applied'
  | 'admitted'
  | 'enrolled'
  | 'rejected'
  | 'withdrawn'

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'interview'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'rejected'
  | 'withdrawn'
  | 'enrolled'

export type DocumentStatus = 'pending' | 'verified' | 'rejected'
export type InterviewMode = 'in_person' | 'online' | 'phone'
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type OfferStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn'
export type Recommendation = 'admit' | 'interview' | 'waitlist' | 'reject'

export interface AdmissionCycle {
  id: string
  academic_session_id: string | null
  name: string
  code: string | null
  status: CycleStatus
  /** The API's own wording for the status. Preferred over humanising the
   *  value, because the two would drift the day a status was renamed. */
  status_label: string
  starts_at: string | null
  ends_at: string | null
  /** Not `status === 'open'`. A cycle can be open and outside its dates. */
  is_accepting_applications: boolean
  required_documents: string[]
  settings: Record<string, unknown> | null
  created_at: string | null
}

export interface Applicant {
  id: string
  applicant_number: string
  user_id: string | null
  person_id: string | null
  status: ApplicantStatus
  status_label: string
  /** Where an applicant's name lives before they are a person here. The API
   *  searches both, and so must anything that prints one. */
  metadata: {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    [key: string]: unknown
  } | null
  created_at: string | null
  applications?: Application[]
}

export interface ApplicationChoice {
  id: string
  application_id: string
  program_id: string
  campus_id: string | null
  /** 1 is the first choice. */
  priority: number
  status: 'pending' | 'offered' | 'rejected' | 'withdrawn'
  status_label: string
}

export interface ApplicationDocument {
  id: string
  application_id: string
  document_type: string
  file_name: string
  mime_type: string | null
  size_bytes: number
  verification_status: DocumentStatus
  verification_status_label: string
  verification_note: string | null
  verified_by: string | null
  verified_at: string | null
  created_at: string | null
}

export interface ApplicationReview {
  id: string
  application_id: string
  reviewer_id: string | null
  score: number | null
  recommendation: Recommendation
  recommendation_label: string
  notes: string | null
  reviewed_at: string | null
}

export interface AdmissionInterview {
  id: string
  application_id: string
  interviewer_id: string | null
  scheduled_at: string | null
  ends_at: string | null
  duration_minutes: number | null
  mode: InterviewMode
  location: string | null
  status: InterviewStatus
  status_label: string
  outcome: string | null
  score: number | null
  notes: string | null
  completed_at: string | null
}

export interface AdmissionOffer {
  id: string
  application_id: string
  program_id: string | null
  academic_session_id: string | null
  /** Set once the offer has been converted into a learner. */
  student_id: string | null
  status: OfferStatus
  status_label: string
  /** Still answerable — not expired, withdrawn or already answered. */
  is_open: boolean
  is_converted: boolean
  offered_at: string | null
  expires_at: string | null
  accepted_at: string | null
  declined_at: string | null
}

export interface Application {
  id: string
  application_number: string
  admission_cycle_id: string
  applicant_id: string
  status: ApplicationStatus
  status_label: string
  /** The API's answer to "can this still be changed". Never derived here from
   *  the status, because the rule lives in the policy and moves with it. */
  is_editable: boolean
  is_final: boolean
  submitted_at: string | null
  decided_at: string | null
  created_at: string | null
  applicant?: { id: string; applicant_number: string; name: string | null } | null
  /** Absent unless the endpoint loaded them — `show` does, `index` loads only
   *  choices. */
  choices?: ApplicationChoice[]
  documents?: ApplicationDocument[]
  reviews?: ApplicationReview[]
  interviews?: AdmissionInterview[]
  offers?: AdmissionOffer[]
}

export interface ChecklistItem {
  document_type: string
  is_provided: boolean
  /** Provided AND verified. The two differ, and only this one gates a
   *  decision. */
  is_satisfied: boolean
  status: DocumentStatus | null
  application_document_id: string | null
}

export interface Checklist {
  application_id: string
  is_complete: boolean
  outstanding: string[]
  items: ChecklistItem[]
}

export interface Conversion {
  offer_id: string
  student_id: string
  student_number: string | null
  /** True when this offer had already produced a learner. The endpoint is
   *  idempotent, so a second press returns the first result. */
  was_already_converted: boolean
}

const ROOT = '/admin/admissions'

export const admissionsApi = {
  cycles: (params: { status?: CycleStatus | ''; open?: boolean } = {}) =>
    getPage<AdmissionCycle>(`${ROOT}/cycles`, {
      params: { status: params.status || undefined, open: params.open ? 1 : undefined },
    }),

  cycle: (id: string) => get<AdmissionCycle>(`${ROOT}/cycles/${id}`),

  createCycle: (input: {
    name: string
    code?: string
    academic_session_id?: string
    starts_at?: string
    ends_at?: string
    required_documents?: string[]
  }) => post<AdmissionCycle>(`${ROOT}/cycles`, input),

  /** Its own endpoint: opening a cycle starts accepting applications and
   *  closing one stops, which is not the same as editing a name. */
  setCycleStatus: (id: string, status: CycleStatus) =>
    patch<AdmissionCycle>(`${ROOT}/cycles/${id}/status`, { status }),

  applicants: (params: { search?: string; status?: ApplicantStatus | ''; page?: number }) =>
    getPage<Applicant>(`${ROOT}/applicants`, {
      params: {
        search: params.search || undefined,
        status: params.status || undefined,
        page: params.page,
      },
    }),

  applicant: (id: string) => get<Applicant>(`${ROOT}/applicants/${id}`),

  createApplicant: (input: {
    metadata: { first_name: string; last_name: string; email?: string; phone?: string }
  }) => post<Applicant>(`${ROOT}/applicants`, input),

  applications: (params: {
    admission_cycle_id?: string
    applicant_id?: string
    status?: ApplicationStatus | ''
    submitted?: boolean
    search?: string
    page?: number
    per_page?: number
  }) =>
    getPage<Application>(`${ROOT}/applications`, {
      params: {
        admission_cycle_id: params.admission_cycle_id || undefined,
        applicant_id: params.applicant_id || undefined,
        status: params.status || undefined,
        submitted: params.submitted ? 1 : undefined,
        search: params.search || undefined,
        page: params.page,
        per_page: params.per_page,
      },
    }),

  application: (id: string) => get<Application>(`${ROOT}/applications/${id}`),

  createApplication: (input: {
    applicant_id: string
    admission_cycle_id: string
    choices?: { program_id: string; campus_id?: string }[]
  }) => post<Application>(`${ROOT}/applications`, input),

  checklist: (id: string) => get<Checklist>(`${ROOT}/applications/${id}/checklist`),

  /** A PUT: the list replaces what was there, and priority is the array order
   *  the API assigns. Sending one choice does not append it. */
  setChoices: (id: string, choices: { program_id: string; campus_id?: string }[]) =>
    put<Application>(`${ROOT}/applications/${id}/choices`, { choices }),

  submit: (id: string) => post<Application>(`${ROOT}/applications/${id}/submit`),

  withdraw: (id: string, reason: string) =>
    post<Application>(`${ROOT}/applications/${id}/withdraw`, { reason }),

  reject: (id: string, reason: string) =>
    post<Application>(`${ROOT}/applications/${id}/reject`, { reason }),

  documents: (id: string) => get<ApplicationDocument[]>(`${ROOT}/applications/${id}/documents`),

  uploadDocument: (id: string, file: File, documentType: string) => {
    const body = new FormData()
    body.append('file', file)
    body.append('document_type', documentType)
    return post<ApplicationDocument>(`${ROOT}/applications/${id}/documents`, body)
  },

  verifyDocument: (
    applicationId: string,
    documentId: string,
    input: { verification_status: 'verified' | 'rejected'; note?: string },
  ) =>
    post<ApplicationDocument>(
      `${ROOT}/applications/${applicationId}/documents/${documentId}/verify`,
      input,
    ),

  /**
   * The bytes of one document.
   *
   * Streamed into a blob rather than opened as a URL, for the reason the
   * resource emits no storage path: a link outlives the reader's right to the
   * file. The caller owns the object URL and must revoke it.
   */
  async downloadDocument(applicationId: string, documentId: string): Promise<Blob> {
    const response = await http.get<Blob>(
      `${ROOT}/applications/${applicationId}/documents/${documentId}/download`,
      { responseType: 'blob' },
    )
    return response.data
  },

  reviews: (id: string) => get<ApplicationReview[]>(`${ROOT}/applications/${id}/reviews`),

  addReview: (
    id: string,
    input: { score?: number; recommendation: Recommendation; notes?: string },
  ) => post<ApplicationReview>(`${ROOT}/applications/${id}/reviews`, input),

  interviews: (id: string) => get<AdmissionInterview[]>(`${ROOT}/applications/${id}/interviews`),

  scheduleInterview: (
    id: string,
    input: {
      scheduled_at: string
      duration_minutes?: number
      mode: InterviewMode
      location?: string
      interviewer_id?: string
    },
  ) => post<AdmissionInterview>(`${ROOT}/applications/${id}/interviews`, input),

  rescheduleInterview: (
    applicationId: string,
    interviewId: string,
    input: { scheduled_at: string; duration_minutes?: number; location?: string },
  ) =>
    patch<AdmissionInterview>(
      `${ROOT}/applications/${applicationId}/interviews/${interviewId}`,
      input,
    ),

  recordOutcome: (
    applicationId: string,
    interviewId: string,
    input: { status: InterviewStatus; outcome?: string; score?: number; notes?: string },
  ) =>
    post<AdmissionInterview>(
      `${ROOT}/applications/${applicationId}/interviews/${interviewId}/outcome`,
      input,
    ),

  cancelInterview: (applicationId: string, interviewId: string) =>
    del(`${ROOT}/applications/${applicationId}/interviews/${interviewId}`),

  offers: (id: string) => get<AdmissionOffer[]>(`${ROOT}/applications/${id}/offers`),

  makeOffer: (
    id: string,
    input: { academic_session_id?: string; program_id?: string; expires_at?: string },
  ) => post<AdmissionOffer>(`${ROOT}/applications/${id}/offers`, input),

  withdrawOffer: (applicationId: string, offerId: string, reason: string) =>
    post<AdmissionOffer>(`${ROOT}/applications/${applicationId}/offers/${offerId}/withdraw`, {
      reason,
    }),

  acceptOffer: (applicationId: string, offerId: string) =>
    post<AdmissionOffer>(`${ROOT}/applications/${applicationId}/offers/${offerId}/accept`),

  declineOffer: (applicationId: string, offerId: string, reason?: string) =>
    post<AdmissionOffer>(`${ROOT}/applications/${applicationId}/offers/${offerId}/decline`, {
      reason,
    }),

  /** Creates a person and a learner from the applicant. Idempotent — see the
   *  note on `Conversion`. */
  convert: (
    applicationId: string,
    offerId: string,
    input: {
      person?: Record<string, unknown>
      student?: Record<string, unknown>
    },
  ) =>
    post<Conversion>(`${ROOT}/applications/${applicationId}/offers/${offerId}/convert`, input),
}

export const admissionKeys = {
  root: ['admin', 'admissions'] as const,
  cycles: (params: unknown) => ['admin', 'admissions', 'cycles', params] as const,
  applicants: (params: unknown) => ['admin', 'admissions', 'applicants', params] as const,
  applications: (params: unknown) => ['admin', 'admissions', 'applications', params] as const,
  application: (id: string) => ['admin', 'admissions', 'application', id] as const,
  checklist: (id: string) => ['admin', 'admissions', 'checklist', id] as const,
}

/**
 * The stages a queue is worked in, in order.
 *
 * Not every `ApplicationStatus` — `draft` has not been sent yet and the four
 * terminal ones are outcomes rather than work. These five are what somebody
 * clears in a morning, which is what the funnel counts.
 */
export const PIPELINE_STAGES: { status: ApplicationStatus; label: string }[] = [
  { status: 'submitted', label: 'New' },
  { status: 'under_review', label: 'In review' },
  { status: 'interview', label: 'Interview' },
  { status: 'offered', label: 'Offered' },
  { status: 'accepted', label: 'Accepted' },
]

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  admit: 'Admit',
  interview: 'Interview',
  waitlist: 'Waitlist',
  reject: 'Reject',
}

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  in_person: 'In person',
  online: 'Online',
  phone: 'Phone',
}

/** An applicant's name, from wherever it lives. */
export function applicantName(applicant: Applicant | null | undefined): string {
  if (!applicant) return 'Unnamed applicant'
  const first = applicant.metadata?.first_name?.trim() ?? ''
  const last = applicant.metadata?.last_name?.trim() ?? ''
  const joined = `${first} ${last}`.trim()
  return joined || applicant.applicant_number
}
