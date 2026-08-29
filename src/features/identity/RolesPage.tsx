import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock, Plus, ShieldCheck } from '@phosphor-icons/react'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SearchInput,
  Segmented,
  Skeleton,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { MetaDot, PageHeader } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { humanize } from '@/shared/lib/format'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { identityApi, identityKeys } from './identity.api'
import { NewRoleDialog } from './RoleDialogs'
import { coverageOf } from './coverage'
import { CoverageLegend, CoverageMap } from './CoverageMap'
import type { Role } from './identity.types'
import type { PermissionCatalogue } from './identity.api'

type Kind = 'all' | 'custom' | 'system' | 'platform'

/**
 * Roles, as a map of what they can actually reach.
 *
 * A table of names and counts makes fifteen roles look interchangeable. The
 * coverage map does not: a finance officer and a form tutor leave different
 * fingerprints, and you can see that before you open either. The lock on a
 * system role is still shown — that is the API's rule, not a UI choice.
 */
export function RolesPage() {
  const perms = usePermissions()
  const [term, setTerm] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [creating, setCreating] = useState(false)

  const roles = useQuery({
    queryKey: identityKeys.roles(),
    queryFn: () => identityApi.roles({ per_page: 100 }),
  })

  const catalogue = useQuery({
    queryKey: identityKeys.permissions(),
    queryFn: identityApi.permissions,
    staleTime: Infinity,
  })

  const all = roles.data?.rows ?? []

  const counts = useMemo(() => {
    let custom = 0
    let system = 0
    let platform = 0
    for (const role of all) {
      if (role.is_platform) platform += 1
      else if (role.is_system) system += 1
      else custom += 1
    }
    return { all: all.length, custom, system, platform }
  }, [all])

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase()
    return all.filter((role) => {
      if (kind === 'custom' && (role.is_system || role.is_platform)) return false
      if (kind === 'system' && (!role.is_system || role.is_platform)) return false
      if (kind === 'platform' && !role.is_platform) return false
      if (!q) return true
      return (
        role.name.toLowerCase().includes(q) ||
        (role.description ?? '').toLowerCase().includes(q) ||
        role.permissions.some((p) => p.includes(q))
      )
    })
  }, [all, term, kind])

  if (roles.isError) return <ErrorState error={roles.error} onRetry={() => roles.refetch()} />

  return (
    <PageStack>
      <PageHeader
        title="Roles and permissions"
        meta={
          <>
            {roles.data && <span>{roles.data.pagination.total} roles</span>}
            {roles.data && catalogue.data && <MetaDot />}
            {catalogue.data && (
              <span>
                {catalogue.data.total} permissions across {catalogue.data.groups.length} modules
              </span>
            )}
          </>
        }
        actions={
          perms.has('rbac.manage') ? (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => setCreating(true)}
            >
              New role
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <SearchInput
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search roles or permissions"
              aria-label="Search roles"
              className="w-72"
            />
            <Segmented
              label="Kind of role"
              value={kind}
              onChange={(value) => setKind(value as Kind)}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'custom', label: 'Custom', count: counts.custom },
                { value: 'system', label: 'System', count: counts.system },
                ...(counts.platform > 0
                  ? [{ value: 'platform', label: 'Platform', count: counts.platform }]
                  : []),
              ]}
            />
          </div>
          <CoverageLegend className="hidden lg:flex" />
        </div>

        {roles.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={20} />}
            title={term || kind !== 'all' ? 'No role matches that' : 'No roles'}
            description={
              term
                ? 'Search covers role names, descriptions and permission keys.'
                : kind === 'custom'
                  ? 'Custom roles are the ones this institution has added.'
                  : 'Roles define what people can do here.'
            }
            action={
              term || kind !== 'all' ? (
                <Button
                  onClick={() => {
                    setTerm('')
                    setKind('all')
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((role) => (
              <li key={role.id}>
                <RoleCard role={role} catalogue={catalogue.data} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewRoleDialog open={creating} onClose={() => setCreating(false)} />
    </PageStack>
  )
}

function RoleCard({
  role,
  catalogue,
}: {
  role: Role
  catalogue: PermissionCatalogue | undefined
}) {
  const domains = useMemo(
    () => (catalogue ? coverageOf(catalogue.groups, role.permissions) : []),
    [catalogue, role.permissions],
  )

  const touched = domains.filter((d) => d.held > 0).map((d) => humanize(d.domain))
  const shown = touched.slice(0, 3)
  const rest = touched.length - shown.length

  return (
    <Link
      to="/rbac/$roleId"
      params={{ roleId: role.id }}
      className={cn(
        'flex h-full flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4',
        'transition-colors duration-150 hover:border-gray-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-md font-semibold text-gray-900">
            <span className="truncate">{humanRole(role.name)}</span>
            {role.is_system && (
              <Lock size={13} weight="fill" className="shrink-0 text-gray-500" aria-label="System role" />
            )}
          </p>
          {role.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{role.description}</p>
          ) : (
            <p className="mt-0.5 text-sm text-gray-500">No description</p>
          )}
        </div>
        {role.is_platform ? (
          <Badge tone="accent">Platform</Badge>
        ) : role.is_system ? (
          <Badge tone="neutral">System</Badge>
        ) : (
          <Badge tone="outline">Custom</Badge>
        )}
      </div>

      {catalogue ? (
        <CoverageMap domains={domains} density="domain" size="md" />
      ) : (
        <Skeleton className="h-7 w-full" />
      )}

      <p className="mt-auto flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
        <span className="tabular text-gray-900">{role.permissions.length}</span>
        <span>permissions</span>
        {shown.length > 0 && (
          <>
            <span className="text-gray-400" aria-hidden>
              ·
            </span>
            <span className="truncate">
              {shown.join(', ')}
              {rest > 0 ? ` +${rest}` : ''}
            </span>
          </>
        )}
      </p>
    </Link>
  )
}

/** `admissions_officer` → `Admissions officer`. The API stores the key as the
 *  name for system roles. */
export function humanRole(name: string): string {
  const spaced = name.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
