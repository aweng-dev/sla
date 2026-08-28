import { useCallback } from 'react'
import { authApi } from './auth.api'
import { useSessionStore } from './session.store'

/**
 * Sign out, and mean it.
 *
 * ── Why this ends in a full page load ──────────────────────────────────────
 *
 * `window.location.assign` rather than a router navigation, deliberately. The
 * QueryClient is a module singleton and every zustand store is module state;
 * an SPA navigation leaves both alive, so the next person to sign in on this
 * machine mounts on the last one's cached students and invoices. A document
 * load is the only teardown that cannot miss a cache somebody adds later.
 *
 * The token is revoked first, but the sign-out proceeds even if that call
 * fails — a network error must not trap somebody in a session they have asked
 * to leave. The local token is dropped either way; a server-side token that
 * outlives its client expires on its own.
 */
export function useSignOut() {
  const signOut = useSessionStore((s) => s.signOut)

  return useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* see above */
    } finally {
      signOut()
      window.location.assign('/login')
    }
  }, [signOut])
}
