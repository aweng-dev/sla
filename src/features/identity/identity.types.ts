/**
 * Identity: who exists in this institution, and what they may reach.
 *
 * ── The three layers, and why the screens keep them apart ──────────────────
 *
 *   CATALOGUE   `GET /admin/permissions` — the 234 permissions this product
 *               defines, grouped by module. Fixed; nobody edits it.
 *   ROLE        a named bundle of permissions. Most people get their access
 *               this way, and a system role cannot be edited.
 *   GRANT       a permission or a scope attached to ONE person, over and above
 *               their role. The escape hatch, and the thing an auditor asks
 *               about — which is why every scope grant demands a reason.
 *
 * A person's effective access is the union, and `GET /admin/users/{id}/access`
 * is the only honest answer to "what can they actually do" — it resolves all
 * three and reports, per module, WHY it is on.
 */

export interface PermissionEntry {
  key: string
  name: string
  /** Marked by the API as consequential — deleting records, moderating
   *  results, overriding another person's permissions. Rendered with a warning
   *  rather than hidden: the point is that granting it is a decision. */
  privileged: boolean
}

/** The catalogue arrives grouped by module, which is also how it should be
 *  read — nobody reasons about `gradebook.manage` in isolation. */
export interface PermissionGroup {
  module: string
  name: string
  domain: string
  permissions: PermissionEntry[]
}

export interface Role {
  id: string
  name: string
  key: string
  description: string | null
  /** Shipped with the product. Its permissions are fixed. */
  is_system: boolean
  /** Belongs to the platform, not this institution. Never editable here. */
  is_platform: boolean
  permissions: string[]
}

/** What `GET /admin/users` returns — a person, not an account. `kinds` says
 *  what they are here; somebody can be staff and a guardian at once. */
export interface DirectoryUser {
  user_id: string
  person_id: string | null
  name: string
  kinds: string[]
  title: string | null
  guardian_of: { id?: string; name?: string }[]
}

export interface UserScopes {
  tenant_id: string
  user_id: string
  by_type: Record<string, string[]> | never[]
  is_tenant_wide: boolean
  is_platform_wide: boolean
  student_id: string | null
  staff_id: string | null
  child_student_ids: string[]
}

/**
 * One module, resolved for one person.
 *
 * `source` is the useful part and the reason this screen exists: it says
 * whether the module is on because the institution enables it by default,
 * because a permission the person holds turns it on, or not at all. Without it
 * "why can Dina not see Finance?" is unanswerable from the UI.
 */
export interface ResolvedModule {
  id: string
  name: string
  domain: string
  enabled: boolean
  source: string
  capabilities: {
    granted: string[]
    denied: string[]
    requires_approval: string[]
  }
  config: unknown
}

export interface UserAccess {
  user_id: string
  permissions: string[]
  scopes: UserScopes
  modules: ResolvedModule[]
}

/* ── Payloads ──────────────────────────────────────────────────────────────*/

export interface RolePayload {
  name?: string
  description?: string | null
  permissions: string[]
}

/**
 * A grant, or a revocation — the same shape for both, because the API uses
 * POST and DELETE on one endpoint with one request class.
 *
 * `reason` is required for a SCOPE grant on POST and on nothing else. That
 * asymmetry is deliberate on the API's part: widening what records somebody
 * can see is the change an audit asks about, and a permission grant is already
 * described by the permission's own name.
 */
export interface AccessGrantPayload {
  type: 'permission' | 'scope'
  permission?: string
  scope_type?: string
  scope_id?: string | null
  reason?: string
  expires_at?: string | null
}

/**
 * Scope types this institution can grant.
 *
 * Derived server-side from the institution TYPE: a school has no campuses and
 * no organizational units, so those two are refused with a validation error
 * rather than silently ignored. `student_self` and `platform` are never
 * grantable by an institution administrator.
 *
 * Confirmed against the running API. The list is filtered again at render time
 * against `supports_campuses` / `supports_organizational_units` so the form
 * never offers a value the server will reject.
 */
export const GRANTABLE_SCOPE_TYPES = [
  'tenant',
  'campus',
  'organizational_unit',
  'academic_session',
  'academic_period',
  'program',
  'academic_level',
  'learning_group',
  'course',
  'course_offering',
  'admission_cycle',
] as const

export type GrantableScopeType = (typeof GRANTABLE_SCOPE_TYPES)[number]
