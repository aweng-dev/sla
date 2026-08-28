import type { ReactNode } from 'react'
import { PageStack } from '@/shared/layout/AppShell'
import { Card, EmptyState, PageHeader, Skeleton } from '@/shared/ui'
import { useModules, useTenant } from '@/features/tenant/TenantProvider'

/**
 * The three states every operations screen starts in.
 *
 * ── Why a module-off state exists at all ───────────────────────────────────
 *
 * The rail is server-driven, so a person normally reaches one of these screens
 * only when the module is on. But these are real URLs — bookmarked, pasted into
 * a message, opened by somebody whose institution switched Transport off last
 * term — and the answer to that is a sentence, not a blank page and not a 403
 * from the first query.
 *
 * ── Drawing is not granting ────────────────────────────────────────────────
 *
 * This decides whether to render, using the same six-layer chain the API's own
 * gate runs. Every endpoint behind the screen re-runs its own check server-side,
 * so a stale module list here shows an empty table, never data somebody may not
 * see.
 */
export function ModuleGate({
  module,
  title,
  description,
  meta,
  offTitle,
  offDescription,
  actions,
  children,
}: {
  /** The module id, as `access.modules` spells it. */
  module: string
  title: string
  /** Prefer `meta`. A module landing screen is a title alone, as Sprig's is. */
  description?: string
  /** A row of small facts under the title, in place of a prose line. */
  meta?: ReactNode
  offTitle: string
  offDescription: string
  actions?: ReactNode
  children: ReactNode
}) {
  const { access } = useTenant()
  const modules = useModules()

  /* `access` arrives on a second request after `/auth/me`, so there is a real
   * moment where somebody is signed in and this screen knows nothing. Treating
   * that as "module off" would flash the wrong sentence at everybody. */
  if (!access) {
    return (
      <PageStack>
        <PageHeader title={title} />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  if (!modules.has(module)) {
    return (
      <PageStack>
        <PageHeader title={title} />
        <Card>
          <EmptyState title={offTitle} description={offDescription} />
        </Card>
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader title={title} description={description} meta={meta} actions={actions} />
      {children}
    </PageStack>
  )
}
