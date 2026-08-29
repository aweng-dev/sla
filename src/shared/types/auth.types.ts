import type { AccessProfile, ModuleSource } from './access.types'
import type { NavigationTree } from './navigation.types'
import type { CurrentCalendar, InstitutionProfile } from './tenant.types'

/** The four tenant-facing front doors. `platform` exists in the API's enum but
 *  is served by a separate console and never reached from this app. */
export type PortalKey = 'admin' | 'staff' | 'teacher' | 'student' | 'guardian'

/** Returned by `POST /auth/login` with a 201 — a token is a resource that did
 *  not exist a moment ago. */
export interface AuthenticatedSession {
  token: string
  expires_at: string | null
  user: { id: string; name: string; email: string | null }
  membership: Membership
}

/**
 * Proof that this user belongs in this institution, and as what.
 *
 * The profile ids are what the self-scopes stand on: `student_id` is set for a
 * learner, `staff_id` for a teacher or administrator, `guardian_id` for a
 * parent. A person can be more than one of these at once.
 */
export interface Membership {
  tenant_id: string
  user_id: string
  person_id: string | null
  status: string
  user_types: string[]
  is_platform_admin: boolean
  joined_at: string | null
  student_id: string | null
  staff_id: string | null
  guardian_id: string | null
}

/** `GET /auth/me`. Identity only — what the caller may REACH is the larger
 *  question answered by `GET /portal/context`. */
export interface MeResponse {
  user: Account
  membership: Membership | null
}

/** The signed-in person as they may see themselves. One shape for `auth/me`
 *  and for every write to `auth/account`, so a saved phone number is read back
 *  in the same fields it was written in. */
export interface Account {
  id: string
  name: string
  email: string | null
  phone: string | null
  email_verified_at: string | null
  phone_verified_at: string | null
  preferred_locale: string | null
  timezone: string | null
  /** Never a URL. The bytes are streamed by an endpoint that has already
   *  established who is asking; this flag says whether to spend that request. */
  has_avatar: boolean
}

export interface Module {
  id: string
  name: string
  description?: string | null
  domain?: string
  enabled: boolean
  /**
   * Why it resolved this way.
   *
   * On a DISABLED module this is the difference between two sentences a
   * reader deserves to be told apart: `denied` means the institution does not
   * have this module — wrong institution type for it, or not entitled — and
   * anything else means the institution has it and this person does not reach
   * it. A screen that said "your school does not run a gradebook" to a teacher
   * who simply lacks the permission is lying to them.
   */
  source?: ModuleSource
  [key: string]: unknown
}

/** Everything the client needs once, immediately after sign-in — one round
 *  trip rather than five, because the five are useless apart. */
export interface AccessContext {
  modules: Module[]
  navigation: NavigationTree
  /** Dotted strings: `students.view`, `finance.manage`. 233 of them for an
   *  institution owner, 27 for a guardian. */
  permissions: string[]
  scopes: ScopeSet
  profiles: AccessProfile[]
  institution: InstitutionProfile
  calendar: CurrentCalendar
}

/**
 * How far this user can see.
 *
 * `is_tenant_wide` is the administrator's answer. Everyone else is narrowed:
 * a teacher by `by_type` (their courses, groups and campus), a student to
 * themselves via `student_id`, a guardian to `child_student_ids`.
 *
 * None of this authorizes anything — it describes what to render. Every route
 * behind every screen re-runs its own check server-side.
 */
export interface ScopeSet {
  tenant_id: string
  user_id: string
  by_type: Record<string, string[]> | never[]
  is_tenant_wide: boolean
  is_platform_wide: boolean
  student_id: string | null
  staff_id: string | null
  child_student_ids: string[]
}
