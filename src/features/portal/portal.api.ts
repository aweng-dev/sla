import { get } from '@/shared/api/client'

/**
 * The same institution, as the people it is about see it.
 *
 * ── Why these exist beside the staff clients ───────────────────────────────
 *
 * Several modules are reached by BOTH: `gradebook`, `results`, `library`,
 * `transport`, `hostel` and `lms` all list `student_self` among their access
 * profiles, and most list `guardian_children` too. So the rail draws the item
 * for a learner — correctly — and a screen that spoke only `/teaching/…` or
 * `/admin/…` would send them at an endpoint carrying the `staff` middleware,
 * which answers 403.
 *
 * The API has always had the other half. These are those endpoints.
 *
 * ── They narrow themselves, and take no id to widen ────────────────────────
 *
 * Not one of these calls takes a student id. The set is derived server-side
 * from the caller's own membership and the children they are AUTHORIZED for —
 * a merely-linked contact is not on it — and every row found is put to its own
 * policy afterwards. So there is nothing for this client to pass and nothing it
 * could pass that would show somebody else's record.
 */

/* ── Results ─────────────────────────────────────────────────────────────── */

/**
 * A released course grade.
 *
 * Published only. The staff side computes and approves; this side sees what
 * was actually released, which is why a learner's list can be empty on a day
 * their teacher has already finished marking.
 */
export interface PortalResult {
  id: string
  student_id: string
  course_offering_id: string | null
  course_id: string | null
  course?: { id: string; code: string | null; title: string } | null
  percentage: number | null
  letter_grade: string | null
  grade_point: number | null
  quality_points: number | null
  credit_units: number | null
  is_passing: boolean | null
  status: string
  published_at: string | null
  /** Where the mark came from — one row per assessment category. */
  components?: {
    id: string
    label: string | null
    raw_score: number | null
    max_score: number | null
    weight_percent: number | null
    weighted_score: number | null
    items_count: number | null
    sequence: number
  }[]
  class_position?: number | null
  class_average?: number | null
}

/* ── The library card ────────────────────────────────────────────────────── */

export interface LibraryStanding {
  member_id: string
  student_id: string | null
  member_number: string
  member_name: string | null
  status: string
  loan_ceiling: number
  owed_minor: number
  currency: string
  overdue_count: number
  has_overdue_items: boolean
}

export interface PortalLoan {
  id: string
  status: string
  is_outstanding: boolean
  due_at: string | null
  returned_at: string | null
  renewal_count: number
  /** The API's own count, never one derived here from `due_at`. */
  days_overdue: number
  copy?: { id: string; barcode: string; title?: { title: string } | null } | null
}

/* ── Where they sleep, and how they get in ───────────────────────────────── */

export interface PortalAllocation {
  id: string
  hostel_bed_id: string
  student_id: string
  status: string
  holds_bed: boolean
  starts_on: string | null
  ends_on: string | null
  checked_in_at: string | null
  checked_out_at: string | null
  student?: { id: string; name: string } | null
  bed?: { id: string; label: string; room?: { name: string } | null } | null
}

/** One learner's transport standing. A collection because a guardian may have
 *  several children riding. */
export interface PortalRide {
  student_id: string
  has_place: boolean
  subscription?: { id: string; status: string; starts_on: string | null; ends_on: string | null } | null
  route?: { id: string; name: string; code: string | null } | null
  stops?: { id: string; name: string; sequence: number; scheduled_arrival: string | null }[]
  recent_trips?: { id: string; ran_on: string | null; status: string; direction: string }[]
}

export const portalApi = {
  results: () => get<PortalResult[]>('/portal/results'),

  libraryStanding: () => get<LibraryStanding | null>('/portal/library'),

  libraryLoans: () => get<PortalLoan[]>('/portal/library/loans'),

  hostelAllocation: () => get<PortalAllocation[]>('/portal/hostel/allocation'),

  transportRoute: () => get<PortalRide[]>('/portal/transport/route'),
}

export const portalKeys = {
  root: ['portal', 'me'] as const,
  results: ['portal', 'me', 'results'] as const,
  library: ['portal', 'me', 'library'] as const,
  libraryLoans: ['portal', 'me', 'library', 'loans'] as const,
  hostel: ['portal', 'me', 'hostel'] as const,
  transport: ['portal', 'me', 'transport'] as const,
}
