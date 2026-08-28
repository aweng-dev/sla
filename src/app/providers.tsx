import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { queryClient } from './queryClient'
import { router } from './router'
import { TenantProvider } from '@/features/tenant/TenantProvider'
import { installSessionExpiryHandler } from '@/features/auth/session.store'

/**
 * Provider order is load-bearing.
 *
 *   QueryClientProvider   the cache everything reads from
 *     TenantProvider      queries the tenant + session, and owns the purge
 *       RouterProvider    every screen, which assumes both of the above
 *
 * `TenantProvider` sits INSIDE the query provider because it is itself a
 * consumer — it fetches `/context` and `/portal/context` — and OUTSIDE the
 * router because `useTenant()` is called from the rail, which the router
 * renders. Flipping either nesting produces a runtime error rather than a
 * subtle bug, which is the good kind of coupling.
 */
export function AppProviders() {
  /* Wires the HTTP client's 401 path to the session store. Done in an effect
   * rather than at module scope so React's StrictMode double-mount does not
   * register it twice. */
  useEffect(() => {
    installSessionExpiryHandler()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <RouterProvider router={router} />
        <Toaster
          position="bottom-right"
          toastOptions={{
            /* The toast is the inverted surface, like the bulk-action bar —
             * the two are the only dark chrome in the product and they should
             * look like the same thing. */
            style: {
              background: 'var(--sl-ink-deep)',
              color: 'var(--sl-ink-deep-ink)',
              border: 'none',
              fontSize: '0.8125rem',
            },
          }}
        />
      </TenantProvider>
    </QueryClientProvider>
  )
}
