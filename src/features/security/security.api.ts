import { get, http, PER_PAGE_DEFAULT } from '@/shared/api/client'
import type { ApiEnvelope } from '@/shared/api/envelope'
import type { AuditLogQuery, AuditLogRow } from './security.types'

/**
 * The audit trail is READ ONLY, and this file has no write verb for that
 * reason.
 *
 * Entries are written by the API from inside the transaction of whichever
 * Action made the change, so a grant that rolls back takes its audit line with
 * it. There is no endpoint to add or remove one, and there must never be: one
 * would let somebody manufacture evidence, the other destroy it.
 */
export const securityApi = {
  /**
   * The list, plus the events this institution has actually recorded.
   *
   * `meta.events` rides along with the page rather than coming from a second
   * endpoint, so the filter is populated from the same request that fills the
   * table — and offers only what exists rather than a hard-coded list that
   * drifts every time the API adds an event name.
   *
   * The shared `getPage` cannot be used here: it returns rows and pagination
   * only, and would drop the extra `meta` this endpoint deliberately sends. So
   * this one call reads the envelope directly — the single place in the app
   * that does, and the comment is why.
   */
  logs: async (query: AuditLogQuery) => {
    const response = await http.get<ApiEnvelope<AuditLogRow[]>>('/admin/audit-logs', {
      params: { per_page: PER_PAGE_DEFAULT, ...query },
    })

    return {
      rows: response.data.data ?? [],
      pagination: response.data.meta.pagination,
      events: (response.data.meta.events as string[] | undefined) ?? [],
    }
  },

  entry: (id: string) => get<AuditLogRow>(`/admin/audit-logs/${id}`),
}

export const securityKeys = {
  all: ['security'] as const,
  logs: (params?: unknown) => ['security', 'audit-logs', params] as const,
  entry: (id: string) => ['security', 'audit-logs', 'detail', id] as const,
}
