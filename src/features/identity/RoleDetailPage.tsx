import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Lock, ShieldCheck, Trash, Warning } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EntityIcon,
  ErrorState,
  Field,
  MetaDot,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/shared/ui'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions } from '@/features/tenant/TenantProvider'
import { identityApi, identityKeys, unknownPermissions } from './identity.api'
import { PermissionPicker } from './PermissionPicker'
import { DeleteRoleDialog } from './RoleDialogs'
import { humanRole } from './RolesPage'
import { coverageOf } from './coverage'
import { CoverageLegend, CoverageMap } from './CoverageMap'

/**
 * One role.
 *
 * ── The save bar only appears when something changed ───────────────────────
 *
 * Editing permissions is a lot of small clicks, and a Save button that is
 * always lit gives no signal about whether the thing in front of you is the
 * saved state or your draft. The bar appears on the first change and names how
 * many permissions moved, so the reader can see the size of what they are
 * about to do before they do it.
 */
export function RoleDetailPage() {
  const { roleId } = useParams({ strict: false }) as { roleId: string }
  const perms = usePermissions()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [focusModule, setFocusModule] = useState<string | null>(null)

  const role = useQuery({
    queryKey: identityKeys.role(roleId),
    queryFn: () => identityApi.role(roleId),
  })

  const catalogue = useQuery({
    queryKey: identityKeys.permissions(),
    queryFn: identityApi.permissions,
    staleTime: Infinity,
  })

  /* Re-seed the draft when the SAVED role changes — a different role, or this
   * one after a successful save — and not on every refetch of identical data. */
  const saved = role.data
  const savedKey = saved ? `${saved.id}:${saved.permissions.join(',')}:${saved.description}` : null
  useEffect(() => {
    if (!saved) return
    setSelected(new Set(saved.permissions))
    setDescription(saved.description ?? '')
    setErrors({})
  }, [savedKey, saved])

  const save = useMutation({
    mutationFn: () =>
      identityApi.updateRole(roleId, {
        description: description.trim() || null,
        permissions: [...selected],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: identityKeys.all })
      toast.success('Role updated')
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const merged: Record<string, string> = {}
        for (const [field, message] of Object.entries(error.fieldErrors())) {
          merged[field.startsWith('permissions') ? 'permissions' : field] = message
        }
        setErrors(merged)
        if (Object.keys(merged).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The role could not be saved.')
    },
  })

  const diff = useMemo(() => {
    if (!saved) return { added: [] as string[], removed: [] as string[] }
    const before = new Set(saved.permissions)
    return {
      added: [...selected].filter((k) => !before.has(k)),
      removed: saved.permissions.filter((k) => !selected.has(k)),
    }
  }, [saved, selected])

  const descriptionChanged = saved ? (saved.description ?? '') !== description : false
  const dirty = diff.added.length > 0 || diff.removed.length > 0 || descriptionChanged

  if (role.isLoading) {
    return (
      <PageStack>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageStack>
    )
  }

  if (role.isError || !saved) {
    return (
      <PageStack>
        <Back />
        <ErrorState error={role.error} onRetry={() => role.refetch()} />
      </PageStack>
    )
  }

  /* A system or platform role is fixed by the API. Rendering the picker
   * read-only is more useful than hiding it — the point of opening the page is
   * usually to see what the role actually carries. */
  const locked = saved.is_system || saved.is_platform
  const editable = perms.has('rbac.manage') && !locked
  const orphans = unknownPermissions(saved.permissions, catalogue.data)

  return (
    <PageStack>
      <Back />

      <PageHeader
        icon={
          <EntityIcon>
            <ShieldCheck size={20} weight="bold" />
          </EntityIcon>
        }
        title={humanRole(saved.name)}
        description={saved.description ?? undefined}
        meta={
          <>
            {saved.is_platform ? (
              <Badge tone="accent">Platform role</Badge>
            ) : saved.is_system ? (
              <Badge tone="neutral">
                <Lock size={10} weight="fill" /> System role
              </Badge>
            ) : (
              <Badge tone="outline">Custom role</Badge>
            )}
            <MetaDot />
            <span className="tabular">{saved.permissions.length} permissions</span>
            <MetaDot />
            <code className="text-2xs text-gray-600">{saved.key}</code>
          </>
        }
        actions={
          perms.has('rbac.manage') &&
          !locked && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete this role"
              onClick={() => setDeleting(true)}
            >
              <Trash size={15} />
            </Button>
          )
        }
      />

      {locked && (
        <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Lock size={15} weight="fill" className="mt-0.5 shrink-0 text-gray-600" />
          <p className="text-sm text-gray-700">
            {saved.is_platform
              ? 'This role belongs to the platform and is managed outside this institution.'
              : 'This role ships with the product. Its permissions are fixed — create a custom role if you need a different set.'}
          </p>
        </div>
      )}

      {orphans.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <Warning size={15} className="mt-0.5 shrink-0 text-gray-700" />
          <div className="text-sm">
            <p className="font-medium text-gray-900">
              {orphans.length} permission{orphans.length === 1 ? '' : 's'} not in the catalogue
            </p>
            <p className="mt-0.5 text-gray-700">
              They still apply, but this product no longer defines them:{' '}
              <code className="text-2xs">{orphans.join(', ')}</code>
            </p>
          </div>
        </div>
      )}

      {catalogue.data && (
        <Card>
          <CardHeader
            title="Reach"
            subtitle="One cell per module. Fill is how much of it this role holds. Click a cell to open it."
            actions={<CoverageLegend />}
          />
          <CardBody>
            <CoverageMap
              domains={coverageOf(catalogue.data.groups, selected)}
              density="module"
              size="md"
              activeKey={focusModule}
              onSelect={setFocusModule}
            />
          </CardBody>
        </Card>
      )}

      {editable && (
        <Card>
          <CardHeader title="Description" subtitle="What this role is for." />
          <CardBody>
            <Field error={errors.description}>
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={save.isPending}
                />
              )}
            </Field>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Permissions"
          subtitle={
            editable
              ? 'Everyone holding this role gets all of these. Tick a module to grant the lot.'
              : 'What this role grants. Read-only.'
          }
        />
        <CardBody>
          {errors.permissions && (
            <p role="alert" className="mb-2 text-sm text-danger-500">
              {errors.permissions}
            </p>
          )}
          {catalogue.isLoading || !catalogue.data ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <PermissionPicker
              catalogue={catalogue.data}
              selected={selected}
              onChange={setSelected}
              disabled={save.isPending}
              readOnly={!editable}
              focusModule={focusModule}
              showMap={false}
            />
          )}
        </CardBody>
      </Card>

      {editable && dirty && (
        <div className="sticky bottom-4 z-30 flex justify-center">
          <div className="flex animate-slide-up items-center gap-3 rounded-lg bg-ink-deep py-2 pl-4 pr-2 text-white shadow-float">
            <span className="whitespace-nowrap text-sm">
              {diff.added.length > 0 && (
                <span className="tabular">+{diff.added.length} added</span>
              )}
              {diff.added.length > 0 && diff.removed.length > 0 && ' · '}
              {diff.removed.length > 0 && (
                <span className="tabular">−{diff.removed.length} removed</span>
              )}
              {diff.added.length === 0 && diff.removed.length === 0 && 'Description changed'}
            </span>
            <Button
              size="sm"
              onClick={() => {
                setSelected(new Set(saved.permissions))
                setDescription(saved.description ?? '')
              }}
              disabled={save.isPending}
            >
              Discard
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={save.isPending}
              onClick={() => {
                setErrors({})
                save.mutate()
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      )}

      <DeleteRoleDialog role={saved} open={deleting} onClose={() => setDeleting(false)} />
    </PageStack>
  )
}

function Back() {
  return (
    <Link
      to="/rbac"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={16} weight="bold" />
      All roles
    </Link>
  )
}
