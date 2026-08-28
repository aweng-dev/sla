import { del, get, getPage, post, put, PER_PAGE_DEFAULT } from '@/shared/api/client'
import { qk } from '@/shared/api/queryKeys'
import type {
  GuardianChildLink,
  GuardianPayload,
  GuardianRecord,
  GuardianRow,
} from './guardians.types'

/**
 * Every guardians call in one place.
 *
 * ── Three filters, and only three ──────────────────────────────────────────
 *
 * `GET /admin/guardians` reads `search`, `status` and `student_id`. Nothing
 * else narrows it — read from `GuardianController::index`, not guessed — so
 * nothing else is offered. A control that reports a narrowing it did not do is
 * worse than no control.
 *
 * `student_id` is real and useful but has no picker on the list screen: there
 * is no student catalogue endpoint to populate one from, and loading a
 * hundred learners into a dropdown to filter sixteen guardians is the wrong
 * trade. It is reached the other way round instead — from a child's record,
 * whose Guardians tab lists exactly these links.
 *
 * ── There is no statistics endpoint ────────────────────────────────────────
 *
 * `/admin/students/statistics` has no counterpart here (both `/statistics` and
 * `/stats` are 404). So the status tabs carry no counts — Sprig's own tabs
 * ("All Users", "Groups") carry none either — rather than three extra requests
 * per page load to invent them.
 *
 * ── The same staff gate as students ────────────────────────────────────────
 *
 * Everything below is `/admin/*` and needs a staff PROFILE, not a permission.
 * A guardian holds `guardians.view` and still gets 403 from every route here,
 * including one that would return their own record. The screens branch on
 * `useTenant().portal`, exactly as the students screens do.
 */

/** Seen in the data and accepted as free text (max 40) by the API. Offered as
 *  the tab strip; a value outside it can still arrive from a hand-edited URL
 *  and is handled where the tabs are built. */
export const GUARDIAN_STATUSES = ['active', 'inactive'] as const

export type GuardianStatus = (typeof GUARDIAN_STATUSES)[number]

export interface GuardianListQuery {
  search?: string
  status?: string
  student_id?: string
  page?: number
  per_page?: number
}

/** What a link between a guardian and one child carries. `relationship_type`
 *  is required by the API; everything else has a server-side default. */
export interface GuardianLinkPayload {
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

export type GuardianLinkPatch = Omit<GuardianLinkPayload, 'guardian_id'>

export const guardiansApi = {
  list: (query: GuardianListQuery) =>
    getPage<GuardianRow>('/admin/guardians', {
      params: { per_page: PER_PAGE_DEFAULT, ...query },
    }),

  detail: (guardianId: string) => get<GuardianRecord>(`/admin/guardians/${guardianId}`),

  /** A bare array — this listing sends no `meta.pagination`, so there is no
   *  page to ask for and `get` is the honest call. */
  children: (guardianId: string) =>
    get<GuardianChildLink[]>(`/admin/guardians/${guardianId}/children`),

  /**
   * 201 with the whole record.
   *
   * Only `person.first_name` and `person.last_name` are required, and even
   * those are waived when `person.id` names somebody already on file — the
   * API's way of saying a staff member or an existing parent should become a
   * guardian rather than a second copy of the same human.
   */
  create: (payload: GuardianPayload) => post<GuardianRecord>('/admin/guardians', payload),

  update: (guardianId: string, payload: Partial<GuardianPayload>) =>
    put<GuardianRecord>(`/admin/guardians/${guardianId}`, payload),

  /** Links are created from the CHILD's side — the endpoint is nested under a
   *  student because a link without a child is not a thing. */
  link: (studentId: string, payload: GuardianLinkPayload) =>
    post<GuardianChildLink>(`/admin/students/${studentId}/guardians`, payload),

  updateLink: (linkId: string, payload: GuardianLinkPatch) =>
    put<GuardianChildLink>(`/admin/guardian-links/${linkId}`, payload),

  /** Removes the tie, not the guardian. The person stays on file with their
   *  other children. */
  unlink: (linkId: string) => del(`/admin/guardian-links/${linkId}`),
}

/**
 * Keys for the things `qk.guardians` does not name.
 *
 * Built on top of `qk.guardians.detail(id)` rather than beside it, so
 * `invalidateQueries({ queryKey: qk.guardians.all })` clears a guardian's
 * children along with the record they hang off.
 */
export const guardianKeys = {
  children: (id: string) => [...qk.guardians.detail(id), 'children'] as const,
}
