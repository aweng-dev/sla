import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Lock, Plus, ShieldCheck } from '@phosphor-icons/react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  SearchInput,
  Toolbar,
  type Column,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { MetaDot, PageHeader } from '@/shared/ui'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { identityApi, identityKeys } from './identity.api'
import { NewRoleDialog } from './RoleDialogs'
import type { Role } from './identity.types'

/**
 * Roles and permissions.
 *
 * Most people's access comes from a role, so this is the screen that decides
 * what almost everybody can do. Fifteen roles ship with the product and cannot
 * be edited — that is the API's rule, not a UI choice, and the lock is shown
 * rather than the edit control being silently absent.
 */
export function RolesPage() {
  const perms = usePermissions()
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
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

  const rows = useMemo(() => {
    const all = roles.data?.rows ?? []
    const q = term.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.permissions.some((p) => p.includes(q)),
    )
  }, [roles.data, term])

  const columns: Column<Role>[] = [
    {
      key: 'name',
      header: 'Role',
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-gray-900">{humanRole(row.name)}</span>
            {row.is_system && (
              <Lock size={11} weight="fill" className="shrink-0 text-gray-500" aria-label="System role" />
            )}
          </div>
          {row.description && (
            <div className="truncate text-2xs text-gray-600">{row.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      width: '9rem',
      cell: (row) =>
        row.is_platform ? (
          <Badge tone="accent">Platform</Badge>
        ) : row.is_system ? (
          <Badge tone="neutral">System</Badge>
        ) : (
          <Badge tone="outline">Custom</Badge>
        ),
    },
    {
      key: 'count',
      header: 'Permissions',
      numeric: true,
      width: '8rem',
      cell: (row) => row.permissions.length,
    },
    {
      key: 'reach',
      header: 'Reach',
      width: '16rem',
      /* A count alone does not say what a role IS. The modules it touches do —
       * "Finance, Reports" is the answer somebody is actually looking for. */
      cell: (row) => <Reach role={row} groups={catalogue.data?.groups ?? []} />,
    },
  ]

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
      />

      <div>
        <Toolbar
          filters={
            <SearchInput
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search roles or permissions"
              aria-label="Search roles"
              className="w-72"
            />
          }
          actions={
            perms.has('rbac.manage') && (
              <Button
                variant="primary"
                icon={<Plus size={14} weight="bold" />}
                onClick={() => setCreating(true)}
              >
                New role
              </Button>
            )
          }
        />

        {!roles.isLoading && rows.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={20} />}
            title={term ? 'No role matches that' : 'No roles'}
            description={
              term
                ? 'Search covers role names, descriptions and permission keys.'
                : 'Roles define what people can do here.'
            }
            action={term ? <Button onClick={() => setTerm('')}>Clear search</Button> : undefined}
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={roles.isLoading}
            skeletonRows={8}
            rowHref={(row) => `/rbac/${row.id}`}
            onRowClick={(row) => navigate({ to: '/rbac/$roleId', params: { roleId: row.id } })}
          />
        )}
      </div>

      <NewRoleDialog open={creating} onClose={() => setCreating(false)} />
    </PageStack>
  )
}

/** The modules a role reaches, as chips, capped so a wide role does not push
 *  the row to three lines. */
function Reach({
  role,
  groups,
}: {
  role: Role
  groups: { module: string; name: string; permissions: { key: string }[] }[]
}) {
  const modules = useMemo(() => {
    const held = new Set(role.permissions)
    return groups
      .filter((g) => g.permissions.some((p) => held.has(p.key)))
      .map((g) => g.name)
  }, [role.permissions, groups])

  if (modules.length === 0) return <span className="text-gray-500">—</span>

  const shown = modules.slice(0, 3)
  const rest = modules.length - shown.length

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((name) => (
        <span
          key={name}
          className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-2xs text-gray-700"
        >
          {name}
        </span>
      ))}
      {rest > 0 && <span className="text-2xs text-gray-600">+{rest}</span>}
    </div>
  )
}

/** `admissions_officer` → `Admissions officer`. The API stores the key as the
 *  name for system roles. */
export function humanRole(name: string): string {
  const spaced = name.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
