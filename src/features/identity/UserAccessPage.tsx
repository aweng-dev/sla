import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle, Circle, Plus, Trash, Warning } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  MetaDot,
  PageHeader,
  SearchInput,
  Skeleton,
  Tabs,
  panelId,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { cn } from '@/shared/lib/cn'
import { humanize } from '@/shared/lib/format'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { identityApi, identityKeys } from './identity.api'
import { GrantDialog } from './GrantDialog'
import { kindLabel } from './UsersPage'
import type { ResolvedModule } from './identity.types'
import { CoverageLegend, CoverageMap } from './CoverageMap'

/**
 * What one person can actually reach, and why.
 *
 * ── This screen exists to answer "why" ─────────────────────────────────────
 *
 * "Can Dina see Finance?" is answerable from a role list. "Why can she not?"
 * is not — the answer could be her role, a module the institution has switched
 * off, or a scope that does not cover the records. `GET .../access` resolves
 * all of it and reports a `source` per module, so this screen shows the
 * resolved truth rather than the inputs and leaves the reader to compute it.
 */
export function UserAccessPage() {
  const { userId } = useParams({ strict: false }) as { userId: string }
  const t = useTerminology()
  const perms = usePermissions()
  const { access: mine } = useTenant()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'modules' | 'permissions' | 'scopes'>('modules')
  const [granting, setGranting] = useState(false)
  const [term, setTerm] = useState('')

  const baseId = 'user-access-tabs'

  const user = useQuery({
    queryKey: identityKeys.user(userId),
    queryFn: () => identityApi.user(userId),
  })

  const access = useQuery({
    queryKey: identityKeys.access(userId),
    queryFn: () => identityApi.access(userId),
  })

  const catalogue = useQuery({
    queryKey: identityKeys.permissions(),
    queryFn: identityApi.permissions,
    staleTime: Infinity,
  })

  const revoke = useMutation({
    mutationFn: (permission: string) =>
      identityApi.revoke(userId, { type: 'permission', permission }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: identityKeys.access(userId) })
      toast.success('Permission revoked')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Could not revoke it.'),
  })

  const revokeScope = useMutation({
    mutationFn: (vars: { scope_type: string; scope_id?: string }) =>
      identityApi.revoke(userId, { type: 'scope', ...vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: identityKeys.access(userId) })
      toast.success('Scope revoked')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Could not revoke it.'),
  })

  if (user.isLoading || access.isLoading) {
    return (
      <PageStack>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  if (user.isError || access.isError || !user.data || !access.data) {
    return (
      <PageStack>
        <Back />
        <ErrorState
          error={user.error ?? access.error}
          onRetry={() => {
            user.refetch()
            access.refetch()
          }}
        />
      </PageStack>
    )
  }

  const person = user.data
  const resolved = access.data
  const canManage = perms.has('rbac.permission_overrides') || perms.has('rbac.manage')
  const isSelf = mine?.scopes.user_id === userId

  const enabled = resolved.modules.filter((m) => m.enabled)
  const scopeEntries = Object.entries(
    (resolved.scopes.by_type ?? {}) as Record<string, string[]>,
  )

  return (
    <PageStack>
      <Back />

      <PageHeader
        icon={<Avatar name={person.name} size="xl" className="h-9 w-9 text-xs" />}
        title={person.name}
        meta={
          <>
            {person.title && (
              <>
                <span>{person.title}</span>
                <MetaDot />
              </>
            )}
            {person.kinds.length === 0 ? (
              <Badge tone="accent">Administrator</Badge>
            ) : (
              person.kinds.map((k) => (
                <Badge key={k} tone="neutral">
                  {kindLabel(k, t)}
                </Badge>
              ))
            )}
            <MetaDot />
            <span className="tabular">{resolved.permissions.length} permissions</span>
            <MetaDot />
            <span>
              {resolved.scopes.is_tenant_wide
                ? 'Institution-wide'
                : `${scopeEntries.length} scope type${scopeEntries.length === 1 ? '' : 's'}`}
            </span>
          </>
        }
        actions={
          canManage && (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => setGranting(true)}
            >
              Grant access
            </Button>
          )
        }
        tabs={
          <Tabs
            bare
            baseId={baseId}
            items={[
              { key: 'modules', label: 'Modules', count: enabled.length },
              { key: 'permissions', label: 'Permissions', count: resolved.permissions.length },
              { key: 'scopes', label: 'Scopes' },
            ]}
            value={tab}
            onChange={(key) => setTab(key as typeof tab)}
          />
        }
      />

      {isSelf && (
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <Warning size={15} className="mt-0.5 shrink-0 text-gray-700" />
          <p className="text-sm text-gray-700">
            This is your own account. Removing a permission here can lock you out of the screen you
            are standing on.
          </p>
        </div>
      )}

      <div>
        <div
          role="tabpanel"
          id={panelId(baseId, tab)}
          aria-labelledby={`${baseId}-tab-${tab}`}
        >
          {tab === 'modules' && <ModulesPanel modules={resolved.modules} />}

          {tab === 'permissions' && (
            <PermissionsPanel
              permissions={resolved.permissions}
              groups={catalogue.data?.groups ?? []}
              term={term}
              onTerm={setTerm}
              canManage={canManage}
              onRevoke={(key) => revoke.mutate(key)}
              revoking={revoke.isPending ? revoke.variables : null}
            />
          )}

          {tab === 'scopes' && (
            <ScopesPanel
              scopes={resolved.scopes}
              canManage={canManage}
              onRevoke={(scope_type, scope_id) => revokeScope.mutate({ scope_type, scope_id })}
            />
          )}
        </div>
      </div>

      <GrantDialog userId={userId} open={granting} onClose={() => setGranting(false)} />
    </PageStack>
  )
}

/**
 * Every module, on or off, with the reason.
 *
 * The off ones matter as much as the on ones — this is the screen somebody
 * opens when a colleague says they cannot see something.
 */
function ModulesPanel({ modules }: { modules: ResolvedModule[] }) {
  const [active, setActive] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const byDomain = useMemo(() => {
    const map = new Map<string, ResolvedModule[]>()
    for (const m of modules) {
      const list = map.get(m.domain) ?? []
      list.push(m)
      map.set(m.domain, list)
    }
    return [...map.entries()]
  }, [modules])

  const fingerprint = useMemo(() => modulesAsCoverage(modules), [modules])
  const on = modules.filter((m) => m.enabled).length

  function reveal(id: string) {
    setActive(id)
    const node = listRef.current?.querySelector(`[data-module="${CSS.escape(id)}"]`)
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-semibold tabular text-gray-900">{on}</span> of {modules.length}{' '}
            modules on
          </p>
          <CoverageLegend />
        </div>
        <CoverageMap
          domains={fingerprint}
          density="module"
          size="sm"
          activeKey={active}
          onSelect={reveal}
        />
      </div>

      <div ref={listRef} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {byDomain.map(([domain, group], index) => (
          <div key={domain}>
            <p
              className={cn(
                'bg-table-head px-4 py-2 text-sm font-semibold text-gray-900',
                index > 0 && 'border-t border-gray-200',
              )}
            >
              {humanize(domain)}
            </p>
            <ul>
              {group.map((module) => (
                <li
                  key={module.id}
                  data-module={module.id}
                  className={cn(
                    'flex items-center gap-3 border-t border-gray-200 px-4 py-2.5',
                    active === module.id && 'bg-accent-50/40',
                  )}
                >
                  {module.enabled ? (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-gray-900" aria-hidden />
                  ) : (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-gray-200 bg-gray-50" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm',
                        module.enabled ? 'font-medium text-gray-900' : 'text-gray-600',
                      )}
                    >
                      {module.name}
                    </p>
                    {module.enabled && module.capabilities.granted.length > 0 && (
                      <p className="truncate text-2xs text-gray-600">
                        {module.capabilities.granted.length} capabilities
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-2xs text-gray-600">{sourceLabel(module.source)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function modulesAsCoverage(modules: ResolvedModule[]): import('./coverage').DomainCoverage[] {
  const map = new Map<string, import('./coverage').DomainCoverage>()
  for (const module of modules) {
    const cell = {
      module: module.id,
      name: module.name,
      domain: module.domain,
      total: 1,
      held: module.enabled ? 1 : 0,
      privilegedTotal: 0,
      privilegedHeld: 0,
    }
    const existing = map.get(module.domain)
    if (existing) {
      existing.total += 1
      existing.held += cell.held
      existing.modules.push(cell)
    } else {
      map.set(module.domain, {
        domain: module.domain,
        total: 1,
        held: cell.held,
        privilegedHeld: 0,
        modules: [cell],
      })
    }
  }
  return [...map.values()]
}

/** The API's `source` values, in words a reader can act on. */
function sourceLabel(source: string): string {
  if (source === 'institution_default') return 'Institution default'
  if (source === 'user_permission') return 'From permissions'
  if (source === 'institution_override') return 'Institution override'
  if (source === 'plan') return 'Plan'
  return humanize(source)
}

function PermissionsPanel({
  permissions,
  groups,
  term,
  onTerm,
  canManage,
  onRevoke,
  revoking,
}: {
  permissions: string[]
  groups: { module: string; name: string; domain: string; permissions: { key: string; name: string; privileged: boolean }[] }[]
  term: string
  onTerm: (v: string) => void
  canManage: boolean
  onRevoke: (key: string) => void
  revoking: string | null | undefined
}) {
  const held = new Set(permissions)
  const q = term.trim().toLowerCase()

  const shown = groups
    .map((group) => {
      const entries = group.permissions.filter(
        (p) => held.has(p.key) && (q === '' || p.key.includes(q) || p.name.toLowerCase().includes(q) || group.name.toLowerCase().includes(q)),
      )
      return entries.length > 0 ? { group, entries } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (permissions.length === 0) {
    return <EmptyState title="No permissions" description="This person can reach nothing here." />
  }

  return (
    <>
      <div className="mb-3">
        <SearchInput
          value={term}
          onChange={(e) => onTerm(e.target.value)}
          placeholder="Search permissions"
          aria-label="Search permissions"
          className="w-64"
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nothing matches that" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {shown.map(({ group, entries }, index) => (
            <div key={group.module}>
              <p
                className={cn(
                  'bg-table-head px-4 py-1.5 text-2xs font-semibold text-gray-700',
                  index > 0 && 'border-t border-gray-200',
                )}
              >
                {group.name}
              </p>
              <ul>
                {entries.map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-center gap-3 border-t border-gray-200 px-4 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                      {entry.name}
                    </span>
                    {entry.privileged && <Badge tone="warning">Privileged</Badge>}
                    <code className="shrink-0 text-2xs text-gray-500">{entry.key}</code>
                    {canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Revoke ${entry.key}`}
                        loading={revoking === entry.key}
                        onClick={() => onRevoke(entry.key)}
                      >
                        <Trash size={13} />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <p className="mt-3 text-xs text-gray-600">
          Revoking here removes a DIRECT grant. A permission that comes from a role stays until the
          role changes — it will reappear after a refresh.
        </p>
      )}
    </>
  )
}

function ScopesPanel({
  scopes,
  canManage,
  onRevoke,
}: {
  scopes: import('./identity.types').UserScopes
  canManage: boolean
  onRevoke: (scopeType: string, scopeId?: string) => void
}) {
  const entries = Object.entries((scopes.by_type ?? {}) as Record<string, string[]>)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="How far they can see"
          subtitle="A scope narrows which records a permission applies to."
        />
        <CardBody>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              {scopes.is_tenant_wide ? (
                <CheckCircle size={15} weight="fill" className="text-success-500" />
              ) : (
                <Circle size={15} className="text-gray-300" />
              )}
              <span className={scopes.is_tenant_wide ? 'text-gray-900' : 'text-gray-600'}>
                Institution-wide — every record in the institution
              </span>
            </li>
            {scopes.staff_id && (
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle size={15} weight="fill" className="text-success-500" />
                Has a staff record
              </li>
            )}
            {scopes.student_id && (
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle size={15} weight="fill" className="text-success-500" />
                Their own learner record
              </li>
            )}
            {scopes.child_student_ids.length > 0 && (
              <li className="flex items-center gap-2 text-gray-700">
                <CheckCircle size={15} weight="fill" className="text-success-500" />
                {scopes.child_student_ids.length} child record
                {scopes.child_student_ids.length === 1 ? '' : 's'}
              </li>
            )}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Specific scopes"
          subtitle="Granted individually, over and above their role."
        />
        <CardBody className="p-0">
          {entries.length === 0 ? (
            <EmptyState
              title="No specific scopes"
              description={
                scopes.is_tenant_wide
                  ? 'They see everything already, so a narrower scope would add nothing.'
                  : 'Their reach comes entirely from their role and their own records.'
              }
            />
          ) : (
            <ul className="divide-y divide-gray-200">
              {entries.map(([type, ids]) => (
                <li key={type} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">{humanize(type)}</p>
                    <p className="mt-0.5 truncate text-2xs tabular text-gray-600">
                      {ids.length} {ids.length === 1 ? 'record' : 'records'}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      aria-label={`Revoke all ${type} scopes`}
                      onClick={() => onRevoke(type)}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function Back() {
  return (
    <Link
      to="/authentication"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={16} weight="bold" />
      All people
    </Link>
  )
}
