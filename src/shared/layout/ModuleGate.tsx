import type { ReactNode } from 'react'
import { LockSimple, Prohibit } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { Card, EmptyState, PageHeader, Skeleton } from '@/shared/ui'
import { useModules, useTenant } from '@/features/tenant/TenantProvider'

/**
 * The states every module screen starts in, and the truth about each.
 *
 * ── Two different "no", and telling them apart is the whole point ──────────
 *
 * A module can be off for two unrelated reasons, and the API says which:
 *
 *   denied       the INSTITUTION does not have it. Wrong institution type —
 *                a training centre has no report cards and a university has no
 *                guardians — or not entitled by its plan. Nothing this reader
 *                does will change it; an administrator's decision might.
 *
 *   unreachable  the institution HAS it and this person does not reach it.
 *                Their access profile does not list the module, or they hold
 *                none of the permissions that open it. Somebody who can grant
 *                it exists.
 *
 * This screen used to answer both with "this institution does not run X",
 * which is a lie to the second reader and sends them to the wrong person. The
 * distinction costs one field the API was already sending.
 *
 * ── Drawing is not granting ────────────────────────────────────────────────
 *
 * This decides whether to render, using the same six-layer resolution the
 * API's own gate runs. Every endpoint behind the screen re-runs its own check
 * server-side, so a stale module list here shows an empty screen, never data
 * somebody may not see.
 */
export function ModuleGate({
  module,
  title,
  description,
  offTitle,
  offDescription,
  actions,
  tabs,
  children,
}: {
  /** The module id, as `access.modules` spells it. */
  module: string
  title: string
  description?: string
  /** Said when the INSTITUTION does not have the module. Name the thing, not
   *  the reader — this is not about them. */
  offTitle: string
  offDescription: string
  actions?: ReactNode
  /** The screen's tab strip, rendered inside the header rather than above the
   *  content — see PageHeader. Not drawn on either refusal, where there is
   *  nothing behind the tabs to open. */
  tabs?: ReactNode
  children: ReactNode
}) {
  const { access } = useTenant()
  const modules = useModules()

  /* `access` arrives on a second request after `/auth/me`, so there is a real
   * moment where somebody is signed in and this screen knows nothing. Treating
   * that as "off" would flash the wrong sentence at everybody. */
  if (!access) {
    return (
      <PageStack>
        <PageHeader title={title} />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  const availability = modules.reason(module)

  /*
   * No modules at all is a third thing, and it is about the account rather
   * than the institution: `ResolveModulesForUser` returns an empty collection
   * for somebody who holds no access profile here. Every module then reads as
   * `absent`, and telling them their institution runs nothing would send them
   * to the wrong person entirely.
   */
  if (access.modules.length === 0) {
    return (
      <PageStack>
        <PageHeader title={title} />
        <Card>
          <EmptyState
            icon={<LockSimple size={20} />}
            title="This account has no standing here"
            description="You are signed in, but no role at this institution has been assigned to you yet. Whoever administers accounts can put that right."
          />
        </Card>
      </PageStack>
    )
  }

  if (availability === 'unreachable') {
    return (
      <PageStack>
        <PageHeader title={title} />
        <Card>
          <EmptyState
            icon={<LockSimple size={20} />}
            title="Your role does not include this"
            description={`${title} is switched on here, but it is not part of what your account reaches. Whoever administers roles at this institution can change that.`}
          />
        </Card>
      </PageStack>
    )
  }

  if (availability !== 'enabled') {
    return (
      <PageStack>
        <PageHeader title={title} />
        <Card>
          <EmptyState icon={<Prohibit size={20} />} title={offTitle} description={offDescription} />
        </Card>
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader title={title} description={description} actions={actions} tabs={tabs} />
      {children}
    </PageStack>
  )
}
