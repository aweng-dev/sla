import { useLocation } from '@tanstack/react-router'
import { Compass } from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { useSessionStore } from '@/features/auth/session.store'
import { LinkButton } from './LinkButton'

/**
 * A URL that matches nothing.
 *
 * ── Why it reads no tenant ─────────────────────────────────────────────────
 *
 * This is the router's `notFoundComponent`, hung on the ROOT route — so it
 * renders wherever the miss happened, including in front of somebody who is
 * not signed in and outside the app shell. `useTenant()` throws when the
 * context is null rather than returning null, so calling it here would turn a
 * wrong address into a white screen, which is a worse failure than the one it
 * was reporting. Nothing on this page needs the institution, so it asks for
 * none: the path came from the router and the session state came from a store
 * that exists with or without a provider.
 *
 * ── Why it is this quiet ───────────────────────────────────────────────────
 *
 * A 404 is nearly always a typo or a stale link, and the reader already knows
 * something went wrong. What they do not know is WHICH address failed and where
 * to go instead, so that is all it says — in the same shape as every other
 * empty state in the product: a small neutral tile, a 13px line, a 12px line
 * under it, and one thing to do next.
 */
export function NotFoundPage() {
  const location = useLocation()
  const status = useSessionStore((s) => s.status)

  /* `unknown` means a stored token is still being checked. Sending that person
   * to sign in would be wrong half the time, so they are treated as signed in
   * — the gate on the other side will correct it if the token is dead. */
  const signedOut = status === 'anonymous'

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center px-6',
        /* Bare when nobody is signed in — there is no shell around this — and
         * a block near the top of the canvas when there is, rather than one
         * floating in the middle of an otherwise empty viewport. */
        signedOut ? 'h-dvh bg-sl-bg' : 'py-20',
      )}
    >
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <Compass size={20} />
        </div>

        <p className="text-sm font-medium text-gray-900">There is nothing at this address</p>

        <p className="mt-1 text-xs text-gray-600">
          <span className="font-mono text-gray-900">{location.pathname}</span> does not match any
          screen in this app.
        </p>

        <div className="mt-4 flex justify-center">
          {signedOut ? (
            <LinkButton to="/login" variant="primary">
              Sign in
            </LinkButton>
          ) : (
            <LinkButton to="/dashboard">Go to the dashboard</LinkButton>
          )}
        </div>
      </div>
    </div>
  )
}
