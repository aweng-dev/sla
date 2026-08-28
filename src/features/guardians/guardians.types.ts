/**
 * Shapes transcribed from live `/admin/guardians*` responses, not guessed.
 *
 * ── A guardian is a PERSON plus a profile ──────────────────────────────────
 *
 * The names, birth date, gender, nationality and contact details belong to the
 * `person`; the occupation, employer and status belong to the guardian profile
 * hanging off it. That split is why every write nests a `person` object rather
 * than sending a flat body, and why the same human can be a guardian here and
 * a staff member somewhere else without being duplicated.
 */

export interface GuardianPerson {
  id: string
  full_name: string
  first_name: string
  middle_name: string | null
  last_name: string
  preferred_name: string | null
  date_of_birth: string | null
  gender: string | null
  nationality_code: string | null
  /** Whether this person can sign in. Guardians are created as records first;
   *  an account is a separate act, and most of them never get one. */
  has_login: boolean
  email: string | null
  phone: string | null
}

/** The list row and the detail payload are the SAME shape — confirmed against
 *  both endpoints. There is no fatter detail resource to reach for. */
export interface GuardianRow {
  id: string
  occupation: string | null
  employer: string | null
  status: string
  /** Counted server-side, so a roster can show it without N requests. */
  children_count: number
  person: GuardianPerson
}

export type GuardianRecord = GuardianRow

/**
 * One guardian's link to one child.
 *
 * Everything a school actually needs to act on lives here rather than on the
 * guardian: the same person can be the legal guardian of one child and only an
 * emergency contact for their sibling, and each of those is a different row.
 *
 * `emergency_priority` is 1–20, lower first. `authorizes_record` is derived by
 * the API from the flags below it — it is not a column anyone sets.
 */
export interface GuardianChildLink {
  id: string
  student_id: string
  guardian_id: string
  /** Free text, capped at 80 — "mother", "father", "aunt", "legal guardian".
   *  Not an enum: the API takes any string, and families are not an enum. */
  relationship_type: string
  is_legal_guardian: boolean
  has_financial_responsibility: boolean
  can_pick_up: boolean
  emergency_priority: number | null
  receives_academic_notifications: boolean
  receives_financial_notifications: boolean
  notes: string | null
  authorizes_record: boolean
  student: GuardianChildSummary
}

/**
 * The child as the guardian's own endpoint returns them — four fields, not a
 * student record.
 *
 * Declared here rather than imported from the students feature so the
 * dependency runs one way only: `students.types` imports `GuardianPerson` from
 * this file, and this file imports nothing back.
 */
export interface GuardianChildSummary {
  id: string
  student_number: string | null
  status: string
  full_name: string
}

/** The person half of a create/update. Every field is optional on update; only
 *  the two names are required on create, and even they are waived when an
 *  existing `person.id` is given. */
export interface GuardianPersonPayload {
  id?: string
  first_name?: string
  last_name?: string
  middle_name?: string | null
  preferred_name?: string | null
  date_of_birth?: string | null
  gender?: string | null
  nationality_code?: string | null
  email?: string | null
  phone?: string | null
}

export interface GuardianPayload {
  person: GuardianPersonPayload
  occupation?: string | null
  employer?: string | null
  status?: string
}
