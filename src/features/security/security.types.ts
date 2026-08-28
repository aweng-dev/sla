/**
 * One line of the access audit trail, as `GET /admin/audit-logs` sends it.
 *
 * ── `before` and `after` are shapes, not sentences ─────────────────────────
 *
 * The API stores the changed record rather than a rendered message, precisely
 * so a later reader can answer a question the writer did not anticipate. Their
 * keys differ per event — a permission grant carries `permission` and
 * `scope_type`, a role change carries `added`, `removed` and `permissions` —
 * so nothing here declares them beyond "an object". The screen renders the
 * diff generically for that reason.
 */
export interface AuditLogRow {
  id: string
  /** Dotted and stable: `role.assigned`, `permission.revoked`. */
  event: string
  actor_user_id: string | null
  actor_name: string | null
  subject_user_id: string | null
  subject_name: string | null
  /**
   * A morph alias — `role`, `user`, `course` — OR a bare string. A permission
   * grant records the permission NAME here with no `target_id` beside it, so
   * nothing may assume this names a model.
   */
  target_type: string | null
  target_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string | null
}

/** The events this institution has actually recorded, sent in `meta` so the
 *  filter offers what exists rather than a hard-coded list that drifts. */
export interface AuditLogMeta {
  events: string[]
}

export interface AuditLogQuery {
  event?: string
  actor_user_id?: string
  subject_user_id?: string
  target_type?: string
  from?: string
  to?: string
  search?: string
  page?: number
  per_page?: number
}

/**
 * The verb half of an event name, used only to colour the dot beside it.
 *
 * Derived from the suffix rather than a lookup table, so an event this client
 * has never seen still reads correctly: anything `.revoked`, `.denied`,
 * `.disabled` or `.deleted` took something away, and anything `.granted`,
 * `.assigned`, `.created` or `.enabled` gave something.
 */
export type AuditDirection = 'granted' | 'revoked' | 'changed'

export function auditDirection(event: string): AuditDirection {
  const verb = event.split('.').pop() ?? ''
  if (/^(revoked|denied|disabled|deleted|removed|suspended)$/.test(verb)) return 'revoked'
  if (/^(granted|assigned|created|enabled|added|restored)$/.test(verb)) return 'granted'
  return 'changed'
}

/** `permission.granted` → "Permission granted". The API's own words, made
 *  readable without inventing a translation for each one. */
export function auditLabel(event: string): string {
  const words = event.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
