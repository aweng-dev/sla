/** Shapes returned by `GET /context` (public) and the tenant half of
 *  `GET /portal/context`. Transcribed from live responses, not guessed. */

/**
 * The institution's own words for its concepts.
 *
 * A school calls a `learning_group` a "Class" and a `course` a "Subject"; a
 * university calls them a "Cohort" and a "Module". Rendering the API's own
 * nouns would give one of them the other's vocabulary, so every user-facing
 * label that names a domain concept comes from here.
 *
 * Note `session` and `period`: those are the product's words for the academic
 * year and its divisions in ALL three vocabularies. Never write "Term" or
 * "Academic year" as a concept name in UI copy — "term" is only ever the
 * institution's own KIND label for a period.
 */
export interface Terminology {
  learner: string
  learners: string
  guardian: string
  guardians: string
  teacher: string
  teachers: string
  group: string
  groups: string
  course: string
  courses: string
  programme: string
  programmes: string
  session: string
  sessions: string
  period: string
  periods: string
  level: string
  levels: string
  assessment: string
  assessments: string
  enrolment: string
  section: string
  sections: string
  campus: string
  campuses: string
  classTeacher: string
  courseTeacher: string
  progression: string
  progressed: string
  retained: string
  register: string
  certificate: string
}

export type TerminologyKey = keyof Terminology

export interface Tenant {
  id: string
  name: string
  slug: string
  institution_type: string
  institution_subtype: string | null
  terminology: Terminology
  status: string
  default_timezone: string
  default_locale: string
  default_currency: string
  platform_domain: string
}

export interface Branding {
  institution_name: string
  institution_url: string | null
  logo_path: string | null
  primary_color: string | null
  secondary_color: string | null
}

/** Feature switches, flat and boolean. An absent key is off. */
export type Features = Record<string, boolean>

export interface TenantContext {
  tenant: Tenant
  branding: Branding
  features: Features
}

/** What KIND of institution this is — the question that comes before any
 *  feature flag. A school is not un-entitled to campuses; it has none. */
export interface InstitutionProfile {
  type: string
  label: string
  subtype: string | null
  subtype_label: string | null
  vocabulary: string
  academic_structure: string[]
  period_terms: string[]
  period_label: string
  attendance_modes: { value: string; label: string }[]
  attendance_mode: string
  attendance_mode_label: string
  assessment_models: { value: string; label: string }[]
  assessment_model: string
  assessment_model_label: string
  progression_model: string
  progression_model_label: string
  progression_action: string
  supports_repetition: boolean
  supports_campuses: boolean
  supports_organizational_units: boolean
  organizational_unit_types: string[]
  organizational_unit_collective: string
  organizational_unit_noun: string
  curriculum_anchor: string
  supports_credit_system: boolean
  supports_guardians: boolean
  supports_hostel: boolean
  supports_transport: boolean
  supports_campus_services: boolean
}

/** Which session and period the institution is presently in. A caption, not a
 *  record — the full rows live on the admin surface. */
export interface CurrentCalendar {
  session: { id: string; name: string } | null
  period: { id: string; name: string } | null
}
