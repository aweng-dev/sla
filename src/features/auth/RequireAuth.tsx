import { useEffect, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSessionStore } from './session.store'
import { Spinner } from '@/shared/ui'

/**
 * The gate in front of every signed-in screen.
 *
 * ── Why it waits on `unknown` ──────────────────────────────────────────────
 *
 * A token in localStorage is a claim, not a session — it may have been revoked
 * or expired since the tab was last open, and only `GET /auth/me` can say. The
 * store therefore starts in `unknown` when a token exists, and this component
 * renders nothing but a spinner until the question is answered. Treating
 * `unknown` as signed-out flashes the sign-in screen on every reload for a
 * signed-in user; treating it as signed-in renders a shell that 401s a moment
 * later and bounces them anyway.
 *
 * ── This is not authorization ──────────────────────────────────────────────
 *
 * It decides what to DRAW. Every route behind it re-runs its own check on the
 * server, and a client-side guard that was the only check would be no check at
 * all — the bundle is public.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status)
  const navigate = useNavigate()

  useEffect(() => {
    if (status === 'anonymous') {
      navigate({
        to: '/login',
        replace: true,
        /* Where to come back to. A user who deep-linked into an invoice and
         * was asked to sign in should land on the invoice, not the dashboard. */
        search: { redirect: window.location.pathname + window.location.search },
      })
    }
  }, [status, navigate])

  if (status !== 'authenticated') {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-sl-bg">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return <>{children}</>
}
