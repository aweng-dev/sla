/**
 * Health and discipline — the two surfaces that make up Student Services.
 *
 * They share a directory because they share a shape: both are read through a
 * STUDENT rather than through a list of their own, and both carry a
 * confidentiality tier that decides what a given reader may see.
 */

/* ── Health ──────────────────────────────────────────────────────────────── */

export const CONDITION_KINDS = ['allergy', 'condition', 'dietary', 'medication'] as const
export type ConditionKind = (typeof CONDITION_KINDS)[number]

export const CONDITION_SEVERITIES = ['low', 'moderate', 'severe', 'life_threatening'] as const
export type ConditionSeverity = (typeof CONDITION_SEVERITIES)[number]

/**
 * The emergency card.
 *
 * ── Why this is a different tier from the file below ───────────────────────
 *
 * `GET /health/students/{id}/emergency-summary` is gated on `health_clinic.view`
 * alone — the administration, academic management, TEACHERS, the clinic desk
 * and the family all hold it. Everything else about a child's health
 * additionally needs `health_clinic.clinical_records`, which most profiles do
 * not have.
 *
 * The API's own comment gives the reason, and it is worth repeating here
 * because it shapes the screen: a child collapsing in a corridor cannot wait
 * while somebody works out whether the adult standing over them was granted a
 * clinical permission.
 *
 * `has_record` is false for a child with nothing on file. That is an answer,
 * not a 404 — a teacher checking a class list needs "nothing recorded" rather
 * than something that reads as "no such child".
 */
export interface EmergencyHealthSummary {
  subject_type: string
  subject_id: string
  has_record: boolean
  blood_group: string | null
  emergency_contact: {
    name: string | null
    relationship: string | null
    phone: string | null
    alternate_phone: string | null
  }
  consent_to_emergency_treatment: boolean | null
  /** Only the conditions flagged for the card, not the whole clinical list. */
  conditions: EmergencyCondition[]
  has_critical_condition: boolean
}

export interface EmergencyCondition {
  name: string
  kind?: string | null
  severity?: string | null
  emergency_action?: string | null
  [key: string]: unknown
}

export interface HealthCondition {
  id: string
  health_profile_id: string
  kind: string
  name: string
  severity: string | null
  is_emergency_relevant: boolean
  on_emergency_card: boolean
  emergency_action: string | null
  notes: string | null
  diagnosed_on: string | null
  resolved_on: string | null
  recorded_by_staff_id: string | null
  created_at: string | null
}

export interface ImmunisationRecord {
  id: string
  health_profile_id: string
  vaccine: string
  dose_number: number | null
  administered_on: string | null
  administered_by: string | null
  batch_reference: string | null
  next_due_on: string | null
  /** The API's own reading against today — do not recompute from
   *  `next_due_on`, which would disagree across a timezone. */
  is_due: boolean
  status: string
  notes: string | null
}

export interface HealthProfile {
  id: string
  subject_type: string
  subject_id: string
  blood_group: string | null
  emergency_contact: {
    name: string | null
    relationship: string | null
    phone: string | null
    alternate_phone: string | null
  }
  consent_to_emergency_treatment: boolean | null
  primary_physician_name: string | null
  primary_physician_phone: string | null
  insurance_provider: string | null
  insurance_reference: string | null
  clinical_notes: string | null
  last_reviewed_on: string | null
  reviewed_by_staff_id: string | null
  created_at: string | null
  updated_at: string | null
  conditions?: HealthCondition[]
  immunisations?: ImmunisationRecord[]
}

export interface ClinicVisit {
  id: string
  health_profile_id: string
  campus_id: string | null
  arrived_at: string | null
  departed_at: string | null
  is_open: boolean
  presenting_complaint: string
  observations: Record<string, unknown> | null
  assessment: string | null
  treatment: string | null
  outcome: string | null
  is_reportable_incident: boolean
  is_confidential: boolean
  guardian_notified: boolean
  guardian_notified_at: string | null
  seen_by_staff_id: string | null
}

/* ── Discipline ──────────────────────────────────────────────────────────── */

export const INCIDENT_CATEGORIES = [
  'bullying',
  'violence',
  'property',
  'attendance',
  'academic_dishonesty',
  'conduct',
  'other',
] as const

export const INCIDENT_SEVERITIES = ['minor', 'moderate', 'serious', 'severe'] as const

export const INCIDENT_STATUSES = [
  'reported',
  'under_investigation',
  'substantiated',
  'unsubstantiated',
  'resolved',
  'dismissed',
] as const

export const PARTY_ROLES = ['subject', 'victim', 'witness', 'reporter'] as const
export type PartyRole = (typeof PARTY_ROLES)[number]

export const SANCTION_KINDS = [
  'warning',
  'detention',
  'suspension',
  'exclusion',
  'restorative',
  'community_service',
] as const

export const SANCTION_STATUSES = [
  'proposed',
  'approved',
  'active',
  'served',
  'revoked',
  'overturned',
] as const

export interface IncidentParty {
  id: string
  role: PartyRole
  student_id: string | null
  staff_id: string | null
  student_name?: string | null
  staff_name?: string | null
  statement?: string | null
  [key: string]: unknown
}

/**
 * One incident.
 *
 * ── The list is narrowed per reader, server-side ───────────────────────────
 *
 * `ScopeDisciplineIncidentsToReader` decides which incidents a caller may see
 * before any filter this client sends. A teacher does not see the same list as
 * the head of year, and a family sees only what concerns their own child. So
 * the screen must not describe its own list as "all incidents" — it is the
 * incidents this reader may see, which is a different sentence.
 *
 * `is_confidential` and `student_visible` are separate questions:
 * confidentiality restricts which STAFF may read it, `student_visible`
 * decides whether the family is told at all.
 */
export interface DisciplineIncident {
  id: string
  reference: string | null
  campus_id: string | null
  learning_group_id: string | null
  occurred_at: string | null
  location: string | null
  category: string
  severity: string
  summary: string
  description: string | null
  status: string
  reported_by_staff_id: string | null
  assigned_investigator_staff_id: string | null
  is_confidential: boolean
  student_visible: boolean
  closed_at: string | null
  parties: IncidentParty[]
}

export interface DisciplineSanction {
  id: string
  discipline_incident_id: string
  student_id: string
  kind: string
  reason: string
  starts_on: string | null
  ends_on: string | null
  status: string
  /** Whether it is in force TODAY — a sanction can be approved and not yet
   *  started, or served and past. The API decides; the screen shows. */
  is_effective: boolean
  issued_by_staff_id: string | null
  approved_by_staff_id: string | null
  approved_at: string | null
  revocation_reason: string | null
  can_appeal: boolean
}

/** Merits and demerits. `signed_points` is the API's own arithmetic — a
 *  demerit of 3 arrives as `points: 3` and `signed_points: -3`, so nothing
 *  here has to know which kinds subtract. */
export interface BehaviourRecord {
  id: string
  student_id: string
  kind: string
  points: number
  signed_points: number
  category: string | null
  reason: string
  occurred_on: string | null
  awarded_by_staff_id: string | null
  learning_group_id: string | null
  discipline_incident_id: string | null
}

export interface ConductSummary {
  student_id: string
  merit_points: number
  demerit_points: number
  net_points: number
  incident_count: number
  effective_sanction_count: number
}

/** Severity → the tone a chip or dot should carry. Ordered worst-first so a
 *  reader scanning a list sees the serious ones first. */
export function severityTone(severity: string): 'danger' | 'warning' | 'neutral' {
  if (severity === 'severe' || severity === 'life_threatening' || severity === 'serious') {
    return 'danger'
  }
  if (severity === 'moderate') return 'warning'
  return 'neutral'
}
