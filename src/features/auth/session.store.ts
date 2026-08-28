import { create } from 'zustand'
import { purgeUserScopedQueries } from '@/app/queryClient'
import { readToken, setUnauthorizedHandler, writeToken } from '@/shared/api/client'
import type { ApiError } from '@/shared/api/envelope'
import type { AuthenticatedSession, Membership } from '@/shared/types/auth.types'

/**
 * Whether there is a session, and what it is.
 *
 * ── Why `status` is three states and not a boolean ─────────────────────────
 *
 * `unknown` is the state on first paint when a token exists in storage but has
 * not been checked yet. Collapsing it into "signed out" flashes the sign-in
 * screen on every reload for a signed-in user; collapsing it into "signed in"
 * renders an app shell that 401s a moment later. The router waits on
 * `unknown`, which is the only correct thing to do with a question that has
 * not been answered.
 */
export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous'

interface SessionState {
  status: SessionStatus
  token: string | null
  userId: string | null
  membership: Membership | null
  /** Set when a session ended because the API rejected the token rather than
   *  because the user asked. The sign-in screen reads it once and clears it. */
  expiredMessage: string | null

  signIn: (session: AuthenticatedSession) => void
  /** The user asked. */
  signOut: () => void
  /** The API said so. */
  expire: (message?: string) => void
  confirm: (membership: Membership | null, userId: string) => void
  markAnonymous: () => void
  clearExpiredMessage: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  /* A token in storage is a claim, not a session. `status` stays `unknown`
   * until `/auth/me` either confirms it or 401s. */
  status: readToken() ? 'unknown' : 'anonymous',
  token: readToken(),
  userId: null,
  membership: null,
  expiredMessage: null,

  signIn: (session) => {
    /* Before the token changes, not after. Anything cached under the previous
     * session is now another person's data — see `purgeUserScopedQueries`. */
    purgeUserScopedQueries()
    writeToken(session.token)
    set({
      status: 'authenticated',
      token: session.token,
      userId: session.user.id,
      membership: session.membership,
      expiredMessage: null,
    })
  },

  signOut: () => {
    purgeUserScopedQueries()
    writeToken(null)
    set({
      status: 'anonymous',
      token: null,
      userId: null,
      membership: null,
      expiredMessage: null,
    })
  },

  expire: (message) => {
    /* The critical one. An expiry is followed by a sign-in on the SAME tab
     * with no document load, so this is the only teardown between two people. */
    purgeUserScopedQueries()
    writeToken(null)
    set({
      status: 'anonymous',
      token: null,
      userId: null,
      membership: null,
      expiredMessage: message ?? 'Your session has ended. Please sign in again.',
    })
  },

  confirm: (membership, userId) =>
    set({ status: 'authenticated', membership, userId }),

  markAnonymous: () => {
    writeToken(null)
    set({ status: 'anonymous', token: null, userId: null, membership: null })
  },

  clearExpiredMessage: () => set({ expiredMessage: null }),
}))

/**
 * Wire the HTTP client's 401 path to this store.
 *
 * Registered here rather than imported by the client, because the client is
 * the bottom of the dependency graph — a client that imported a store could
 * not be used by the store. Called once from `app/providers`.
 *
 * Only an EXPIRED session (`AUTHENTICATION_REQUIRED`) reaches this. A 401 on
 * the sign-in form is `INVALID_CREDENTIALS` and stays on the form.
 */
export function installSessionExpiryHandler(): void {
  setUnauthorizedHandler((error: ApiError) => {
    if (useSessionStore.getState().status === 'anonymous') return
    useSessionStore.getState().expire(error.message)
  })
}

/* Selectors. Components subscribe to one field so a token refresh does not
 * re-render every screen that only wanted to know if somebody is signed in. */
export const selectIsAuthenticated = (s: SessionState) => s.status === 'authenticated'
export const selectStatus = (s: SessionState) => s.status
export const selectMembership = (s: SessionState) => s.membership
