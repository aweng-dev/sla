import { get, post, put } from '@/shared/api/client'
import type {
  BehaviourRecord,
  ClinicVisit,
  ConductSummary,
  DisciplineIncident,
  DisciplineSanction,
  EmergencyHealthSummary,
  HealthCondition,
  HealthProfile,
  ImmunisationRecord,
} from './studentServices.types'

/**
 * Health and discipline.
 *
 * ── Neither surface is under `/admin` ──────────────────────────────────────
 *
 * Both sit at their own prefix — `/health/*` and `/discipline/*` — and neither
 * carries the `staff` middleware, deliberately: a learner reads their own
 * emergency card and a guardian reads their child's, and `staff` would refuse
 * exactly the people the emergency tier exists to serve. The authorization is
 * therefore complete in the POLICY rather than in the route stack, which is
 * why this client must never treat "the request succeeded" as "this reader is
 * staff".
 *
 * ── There is no list of health profiles, and that is deliberate ────────────
 *
 * A clinical file is reached through the CHILD, never browsed. So the screen
 * is student-first: pick a learner, then read what is on file for them. The
 * only way in is `/health/students/{id}/emergency-summary`, which answers for
 * a child with no record at all rather than 404-ing — see `has_record`.
 */

export const healthApi = {
  /**
   * The open tier. `health_clinic.view` alone, which teachers and family hold.
   * Answers for a child with nothing on file; `has_record` says which.
   */
  emergencySummary: (studentId: string) =>
    get<EmergencyHealthSummary>(`/health/students/${studentId}/emergency-summary`),

  /** The clinical tier — additionally `health_clinic.clinical_records`. */
  profile: (profileId: string) => get<HealthProfile>(`/health/profiles/${profileId}`),

  /**
   * Idempotent: 201 with a new record, 200 with the one already on file.
   *
   * `subject_type` is `student_profile` / `staff_profile` — the model's own
   * constants, not `student` / `staff`. The API answers a bare `student` with
   * a 422 naming the field, which is how this was found.
   */
  createProfile: (payload: {
    subject_type: 'student_profile' | 'staff_profile'
    subject_id: string
    blood_group?: string | null
    emergency_contact_name?: string | null
    emergency_contact_relationship?: string | null
    emergency_contact_phone?: string | null
    emergency_contact_alternate_phone?: string | null
    consent_to_emergency_treatment?: boolean
    primary_physician_name?: string | null
    primary_physician_phone?: string | null
  }) => post<HealthProfile>('/health/profiles', payload),

  updateProfile: (profileId: string, payload: Record<string, unknown>) =>
    put<HealthProfile>(`/health/profiles/${profileId}`, payload),

  conditions: (profileId: string) =>
    get<HealthCondition[]>(`/health/profiles/${profileId}/conditions`),

  addCondition: (
    profileId: string,
    payload: {
      kind?: string
      name: string
      severity?: string
      is_emergency_relevant?: boolean
      emergency_action?: string | null
      notes?: string | null
      diagnosed_on?: string | null
    },
  ) => post<HealthCondition>(`/health/profiles/${profileId}/conditions`, payload),

  immunisations: (profileId: string) =>
    get<ImmunisationRecord[]>(`/health/profiles/${profileId}/immunisations`),

  addImmunisation: (
    profileId: string,
    payload: {
      vaccine: string
      dose_number?: number
      administered_on?: string | null
      administered_by?: string | null
      batch_reference?: string | null
      next_due_on?: string | null
    },
  ) => post<ImmunisationRecord>(`/health/profiles/${profileId}/immunisations`, payload),

  /** Opens a visit. It stays open until `close` is called — `is_open` is the
   *  flag the clinic desk works from. */
  openVisit: (
    profileId: string,
    payload: {
      presenting_complaint: string
      arrived_at?: string
      assessment?: string | null
      treatment?: string | null
      is_reportable_incident?: boolean
      is_confidential?: boolean
    },
  ) => post<ClinicVisit>(`/health/profiles/${profileId}/visits`, payload),

  visit: (visitId: string) => get<ClinicVisit>(`/health/visits/${visitId}`),

  closeVisit: (visitId: string, payload: { outcome?: string | null; departed_at?: string }) =>
    post<ClinicVisit>(`/health/visits/${visitId}/close`, payload),
}

export const disciplineApi = {
  /**
   * Incidents this reader may see.
   *
   * NOT paginated — the controller returns a plain collection, narrowed
   * server-side by `ScopeDisciplineIncidentsToReader` before any filter here
   * applies. `status` is the only filter the endpoint reads.
   */
  incidents: (query: { status?: string } = {}) =>
    get<DisciplineIncident[]>('/discipline/incidents', { params: query }),

  incident: (incidentId: string) =>
    get<DisciplineIncident>(`/discipline/incidents/${incidentId}`),

  fileIncident: (payload: {
    occurred_at: string
    summary: string
    description?: string | null
    category: string
    severity: string
    location?: string | null
    is_confidential?: boolean
    parties: { role: string; student_id?: string; staff_id?: string; statement?: string | null }[]
  }) => post<DisciplineIncident>('/discipline/incidents', payload),

  notes: (incidentId: string) =>
    get<Record<string, unknown>[]>(`/discipline/incidents/${incidentId}/notes`),

  addNote: (incidentId: string, payload: { body: string }) =>
    post(`/discipline/incidents/${incidentId}/notes`, payload),

  proposeSanction: (
    incidentId: string,
    payload: {
      student_id: string
      kind: string
      reason: string
      starts_on?: string | null
      ends_on?: string | null
    },
  ) => post<DisciplineSanction>(`/discipline/incidents/${incidentId}/sanctions`, payload),

  sanction: (sanctionId: string) => get<DisciplineSanction>(`/discipline/sanctions/${sanctionId}`),

  /** Proposing and approving are separate acts by separate people —
   *  `discipline.sanction_approval` is its own permission. */
  approveSanction: (sanctionId: string) =>
    post<DisciplineSanction>(`/discipline/sanctions/${sanctionId}/approve`, {}),

  revokeSanction: (sanctionId: string, payload: { reason: string }) =>
    post<DisciplineSanction>(`/discipline/sanctions/${sanctionId}/revoke`, payload),

  /** Merits and demerits, and the running total they produce. */
  behaviourRecords: (studentId: string) =>
    get<BehaviourRecord[]>(`/discipline/students/${studentId}/behaviour-records`),

  addBehaviourRecord: (
    studentId: string,
    payload: {
      kind: string
      points?: number
      category?: string | null
      reason: string
      occurred_on?: string | null
    },
  ) => post<BehaviourRecord>(`/discipline/students/${studentId}/behaviour-records`, payload),

  conduct: (studentId: string) =>
    get<ConductSummary>(`/discipline/students/${studentId}/conduct`),
}

export const studentServicesKeys = {
  all: ['student-services'] as const,
  emergency: (studentId: string) => ['student-services', 'health', 'emergency', studentId] as const,
  profile: (profileId: string) => ['student-services', 'health', 'profile', profileId] as const,
  conditions: (profileId: string) =>
    ['student-services', 'health', 'profile', profileId, 'conditions'] as const,
  immunisations: (profileId: string) =>
    ['student-services', 'health', 'profile', profileId, 'immunisations'] as const,
  incidents: (params?: unknown) => ['student-services', 'discipline', 'incidents', params] as const,
  incident: (id: string) => ['student-services', 'discipline', 'incidents', id] as const,
  conduct: (studentId: string) =>
    ['student-services', 'discipline', 'conduct', studentId] as const,
  behaviour: (studentId: string) =>
    ['student-services', 'discipline', 'behaviour', studentId] as const,
}
