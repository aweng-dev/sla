import { useEffect, type ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { cn } from '@/shared/lib/cn'
import { useUiStore } from '@/shared/store/ui.store'
import { List } from '@phosphor-icons/react'
import { Sidebar } from './Sidebar'

/**
 * Rail on the left, canvas on the right, nothing else.
 *
 * ── There is no application header ────────────────────────────────────────
 *
 * Sprig has none, and this had one: a full-width bar carrying the session and
 * period, a search icon and a bell, with a rule under it. It was the loudest
 * piece of furniture in the product, it belonged to no screen, and it pushed
 * every page title down by 48px.
 *
 * Everything it held moved into the rail, where Sprig keeps the equivalent —
 * the session and period sit under the institution name as a caption, and
 * search and notifications joined Help and Settings in the footer block. The
 * canvas now begins with the page title, as Sprig's does.
 *
 * Below `lg` the rail becomes a drawer over a scrim rather than a column,
 * because 240px of a 375px viewport is not a navigation pattern. The drawer
 * closes on a route change — otherwise tapping an item navigates behind a
 * panel that is still covering the result. The only chrome left outside the
 * rail is the button that opens it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)
  const location = useLocation()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname, setMobileNavOpen])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-sl-bg">
      {/* Desktop rail */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink-deep/25"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className="relative h-full w-rail animate-slide-up shadow-float">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
          className="m-3 mb-0 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-gray-100 lg:hidden"
        >
          <List size={18} />
        </button>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[100rem] px-5 py-6 lg:px-[1.875rem] lg:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

/** Vertical rhythm for a page's own blocks. Screens use this rather than
 *  choosing their own gap, so two lists written a month apart line up. */
export function PageStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-4', className)}>{children}</div>
}
