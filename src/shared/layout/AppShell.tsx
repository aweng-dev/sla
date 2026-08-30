import { useEffect, type ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { cn } from '@/shared/lib/cn'
import { useUiStore } from '@/shared/store/ui.store'
import { List } from '@phosphor-icons/react'
import { useTenant } from '@/features/tenant/TenantProvider'
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
  const { branding } = useTenant()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname, setMobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileNavOpen, setMobileNavOpen])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-sl-bg">
      {/* Desktop rail */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0 animate-fade-in bg-ink-deep/25"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className="relative h-full w-rail animate-slide-in shadow-float">
            <Sidebar mobile />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2.5 border-b border-gray-200 bg-white px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <List size={21} weight="bold" />
          </button>
          <p className="min-w-0 truncate text-sm font-bold leading-5 text-gray-900">
            {branding.institution_name}
          </p>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[92rem] px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
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
  return <div className={cn('flex flex-col gap-5 sm:gap-6', className)}>{children}</div>
}
