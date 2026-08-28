import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/envelope'

/**
 * The QueryClient is a module singleton, which is the point and also the trap.
 *
 * It outlives a sign-out performed by SPA navigation — the 401 path, as opposed
 * to an explicit sign-out, which does a full page load. Without an explicit
 * purge one institution's cached students and invoices would mount under the
 * next sign-in. `features/tenant/TenantProvider` owns that purge, keyed on
 * `userId:institutionId`; do not add a second one here.
 */
/**
 * Drop everything that belonged to the last signed-in person.
 *
 * ── The leak this closes ───────────────────────────────────────────────────
 *
 * `qk.auth.me` and `qk.auth.context` are single user-agnostic keys carrying a
 * five-minute `staleTime`. When a token expires, both queries flip to
 * `enabled: false` — and React Query KEEPS a disabled query's data and its
 * `success` status. Sign a second person in on the same tab within those five
 * minutes and the queries re-enable, find their data still fresh, and do not
 * refetch: the new user is handed the previous user's name, email, membership,
 * permissions, scopes and navigation tree.
 *
 * `TenantProvider`'s own purge cannot catch it, because the identity it keys on
 * is read from `meQuery.data.user.id` — the very value that never updates. So
 * the purge has to happen at the moment the SESSION changes, which is here,
 * and is called by both `signIn` and `expire`.
 *
 * The `tenant` branch is deliberately spared: `GET /context` is resolved from
 * the HOST and is identical for everyone browsing this institution. Clearing it
 * would throw the app back to its boot splash on every sign-in for no gain.
 */
export function purgeUserScopedQueries(): void {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'tenant',
  })
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /* Institutional data changes on a human timescale. A minute of staleness
       * removes almost every refetch without anybody noticing. */
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        /* Never retry a refusal. A 401 will not become a 200, a 403 will not
         * become a 200, and a 422 retried three times is three identical
         * validation failures the user waits for. */
        if (error instanceof ApiError) {
          if (error.status >= 400 && error.status < 500 && error.status !== 429) {
            return false
          }
        }
        return failureCount < 2
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      /* A write is never retried automatically. The API has no idempotency
       * key, so a retried POST is a second record. */
      retry: false,
    },
  },
})
