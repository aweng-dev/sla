/**
 * The roll, as the admin API actually sends it.
 *
 * Every shape here was read off a live response, not inferred from a model
 * name. Two of them are worth knowing before writing a screen against them:
 *
 *   1. The LIST row carries no enrolment. `StudentResource` is deliberately
 *      thin — programme, level and class are a `show`, not an index column,
 *      because including them would load four relations per row. A roster
 *      table therefore cannot draw a class column; the class is a FILTER here
 *      and a fact on the detail screen.
 *
 *   2. The DETAIL record keys the student as `student_id`, not `id`. The two
 *      payloads disagree, and code that reads `id` off a record gets
 *      `undefined` rather than an error.
 */

/** The human. The same person may also hold a staff or guardian profile, which
 *  is why it is nested rather than flattened onto the student. */
export interface StudentPerson {
  id: string
  full_name: string
  first_name: string
  last_name: string
  preferred_name: string | null
  date_of_birth: string | null
  gender: string | null
  /** WHETHER there is a photograph, never where it is. The bytes come from
   *  `/admin/students/{id}/photo` behind the same permission as the record. */
  has_photo: boolean
}

export interface StudentPersonDetail extends StudentPerson {
  middle_name: string | null
}

/** One row of `GET /admin/students`. */
export interface StudentRow {
  id: string
  student_number: string
  admission_number: string | null
  status: string
  admission_date: string | null
  graduation_date: string | null
  person: StudentPerson
}

export interface NamedRef {
  id: string
  name: string
  code: string | null
}

export interface StudentSessionEnrollment {
  id: string
  academic_session_id: string
  program_id: string | null
  campus_id: string | null
  academic_level_id: string | null
  learning_group_id: string | null
  status: string
  started_at: string | null
}

export interface StudentProgramEnrollment {
  id: string
  program_id: string
  campus_id: string | null
  current_level_id: string | null
  status: string
  started_at: string | null
}

/** `GET /admin/students/{id}`. Note `student_id` — see the file docblock. */
export interface StudentRecord {
  student_id: string
  student_number: string
  admission_number: string | null
  status: string
  admission_date: string | null
  graduation_date: string | null
  /** Enrolled and not withdrawn: the question a register asks, answered by the
   *  API rather than derived from `status` on the client. */
  is_on_roll: boolean
  person: StudentPersonDetail
  session_enrollment: StudentSessionEnrollment | null
  program_enrollment: StudentProgramEnrollment | null
  program: NamedRef | null
  level: { id: string; name: string; sequence: number } | null
  learning_groups: NamedRef[]
}

/**
 * One element of `GET /portal/my-record` — the ARRAY a learner or a guardian
 * gets instead of the roll: one entry for a learner, one per child for a
 * guardian.
 *
 * It is an ALIAS rather than a copy because the payload is field for field the
 * admin record (plus two ids inside `session_enrollment` nothing here reads).
 * What differs is who may ask: `/admin/students/{id}` demands a staff profile
 * and answers 403 to a parent asking after their own child, while this one is
 * 200 for both. So the shape is shared and the two are kept apart in
 * `students.api.ts`, where the difference actually lives.
 */
export type PortalStudentRecord = StudentRecord

/** `GET /admin/students/statistics`. Counted behind the same scope as the
 *  listing, and narrowed by the same `search`, `program_id` and
 *  `learning_group_id` — but NOT by `status`, so the breakdown can be the
 *  source of the status tab counts without counting itself. */
export interface StudentRollSummary {
  total: number
  on_roll: number
  by_status: Record<string, number>
  by_gender: Record<string, number>
}

/** One row of `GET /admin/enrollments?student_id=…` — a placement in one
 *  session. A student has one per session they have been on the roll for. */
export interface SessionEnrollmentRow {
  id: string
  student_id: string
  academic_session_id: string
  academic_session_name: string | null
  program_id: string | null
  program_name: string | null
  campus_id: string | null
  campus_name: string | null
  academic_level_id: string | null
  academic_level_name: string | null
  learning_group_id: string | null
  learning_group_name: string | null
  status: string
  enrolled_at: string | null
  completed_at: string | null
}

/* The guardians feature owns this shape; a student's record only borrows it.
 * Re-exported so this module's existing importers do not have to know that. */
export type { GuardianPerson } from '@/features/guardians/guardians.types'
import type { GuardianPerson } from '@/features/guardians/guardians.types'

/**
 * One tie between a child and a guardian.
 *
 * `authorizes_record` is the API's own sum of legal guardianship, financial
 * responsibility and academic notifications — the difference between being
 * LINKED and being ENTITLED. Pick-up rights are deliberately not in it, so it
 * must not be recomputed here from the checkboxes.
 */
export interface GuardianLink {
  id: string
  student_id: string
  guardian_id: string
  relationship_type: string | null
  is_legal_guardian: boolean
  has_financial_responsibility: boolean
  can_pick_up: boolean
  emergency_priority: number | null
  receives_academic_notifications: boolean
  receives_financial_notifications: boolean
  notes: string | null
  authorizes_record: boolean
  guardian?: {
    id: string
    occupation: string | null
    employer: string | null
    status: string
    person: GuardianPerson
  }
}

/** `GET /admin/finance/students/{id}/balance`. Every figure is in MINOR units. */
export interface StudentBalance {
  student_id: string
  currency: string
  invoiced_minor: number
  discount_minor: number
  paid_minor: number
  balance_minor: number
  unallocated_minor: number
  overdue_minor: number
  invoice_count: number
  is_settled: boolean
  outstanding_invoice_ids: string[]
}

/** One row of `GET /admin/finance/invoices?student_id=…`. Minor units again. */
export interface InvoiceRow {
  id: string
  student_id: string
  invoice_number: string
  status: string
  origin: string | null
  currency: string
  subtotal_minor: number
  discount_minor: number
  total_minor: number
  paid_minor: number
  balance_minor: number
  issued_at: string | null
  due_on: string | null
  voided_at: string | null
}

/* ── The catalog: thin lookups for filters and the admission form ─────────── */

export interface CatalogProgram {
  id: string
  name: string
  code: string | null
  status: string
}

export interface CatalogGroup {
  id: string
  name: string
  code: string | null
  academic_level_id: string | null
  academic_session_id: string | null
}

export interface CatalogLevel {
  id: string
  name: string
  code: string | null
  sequence: number
}

export interface CatalogSession {
  id: string
  name: string
  code: string | null
  starts_on: string | null
  ends_on: string | null
  status: string
  is_current: boolean
}
