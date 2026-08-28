import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Warning } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import { get } from '@/shared/api/client'
import { Button, Field, Input, Modal, Select, Skeleton, Textarea } from '@/shared/ui'
import { humanize } from '@/shared/lib/format'
import { useTenant } from '@/features/tenant/TenantProvider'
import { identityApi, identityKeys } from './identity.api'
import { GRANTABLE_SCOPE_TYPES } from './identity.types'

/** Catalogues a scope id can be picked from, per scope type. Types absent from
 *  this map take a free-text id, because the API accepts any string and no
 *  catalogue endpoint lists them. */
const SCOPE_CATALOGS: Record<string, string> = {
  academic_session: 'academic-sessions',
  academic_period: 'academic-periods',
  academic_level: 'academic-levels',
  program: 'programs',
  learning_group: 'learning-groups',
  course: 'courses',
  course_offering: 'course-offerings',
  campus: 'campuses',
  organizational_unit: 'organizational-units',
}

interface CatalogRow {
  id: string
  name: string
  code?: string | null
}

/**
 * Granting one person something their role does not give them.
 *
 * ── Two kinds, and they are not symmetric ──────────────────────────────────
 *
 *   PERMISSION  lets them do a thing. Named by the catalogue, so it is a
 *               picker, not free text.
 *   SCOPE       widens which records their permissions apply to. This is the
 *               one an audit asks about, which is why the API demands a reason
 *               for it and not for the other.
 *
 * The scope types offered are filtered by what the INSTITUTION supports — a
 * school has no campuses and the API rejects that value outright — so the form
 * never offers something the server will refuse.
 */
export function GrantDialog({
  userId,
  open,
  onClose,
}: {
  userId: string
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { access } = useTenant()
  const institution = access?.institution

  const [type, setType] = useState<'permission' | 'scope'>('permission')
  const [permission, setPermission] = useState('')
  const [scopeType, setScopeType] = useState('')
  const [scopeId, setScopeId] = useState('')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const catalogue = useQuery({
    queryKey: identityKeys.permissions(),
    queryFn: identityApi.permissions,
    staleTime: Infinity,
    enabled: open,
  })

  const scopeTypes = useMemo(
    () =>
      GRANTABLE_SCOPE_TYPES.filter((s) => {
        if (s === 'campus') return institution?.supports_campuses === true
        if (s === 'organizational_unit') return institution?.supports_organizational_units === true
        return true
      }),
    [institution],
  )

  const catalogName = SCOPE_CATALOGS[scopeType]

  const scopeOptions = useQuery({
    queryKey: ['identity', 'scope-catalog', catalogName],
    queryFn: () => get<CatalogRow[]>(`/admin/catalog/${catalogName}`),
    enabled: open && type === 'scope' && Boolean(catalogName),
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    if (!open) return
    setType('permission')
    setPermission('')
    setScopeType('')
    setScopeId('')
    setReason('')
    setExpiresAt('')
    setErrors({})
  }, [open])

  /* A scope id from a different scope type means nothing. */
  useEffect(() => {
    setScopeId('')
  }, [scopeType])

  const grant = useMutation({
    mutationFn: () =>
      identityApi.grant(userId, {
        type,
        ...(type === 'permission'
          ? { permission }
          : { scope_type: scopeType, scope_id: scopeId || null, reason: reason.trim() }),
        expires_at: expiresAt || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: identityKeys.access(userId) })
      toast.success(type === 'permission' ? 'Permission granted' : 'Scope granted')
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The grant could not be made.')
    },
  })

  const selectedPermission = useMemo(() => {
    for (const group of catalogue.data?.groups ?? []) {
      const entry = group.permissions.find((p) => p.key === permission)
      if (entry) return { entry, group }
    }
    return null
  }, [catalogue.data, permission])

  const ready =
    type === 'permission' ? permission !== '' : scopeType !== '' && reason.trim().length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Grant access"
      description="Given to this person directly, over and above whatever their role provides."
      footer={
        <>
          <Button onClick={onClose} disabled={grant.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={grant.isPending}
            disabled={!ready}
            onClick={() => {
              setErrors({})
              grant.mutate()
            }}
          >
            Grant
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field
          label="What to grant"
          hint={
            type === 'permission'
              ? 'Lets them do something their role does not allow.'
              : 'Widens which records their permissions apply to.'
          }
        >
          {(props) => (
            <Select
              {...props}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              options={[
                { value: 'permission', label: 'A permission' },
                { value: 'scope', label: 'A scope' },
              ]}
            />
          )}
        </Field>

        {type === 'permission' ? (
          <>
            {catalogue.isLoading || !catalogue.data ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <Field label="Permission" required error={errors.permission}>
                {(props) => (
                  <Select
                    {...props}
                    value={permission}
                    onChange={(e) => setPermission(e.target.value)}
                    placeholder="Choose a permission"
                    options={catalogue.data.groups.flatMap((group) =>
                      group.permissions.map((entry) => ({
                        value: entry.key,
                        label: `${group.name} · ${entry.name}${entry.privileged ? ' (privileged)' : ''}`,
                      })),
                    )}
                  />
                )}
              </Field>
            )}

            {selectedPermission?.entry.privileged && (
              <div className="mb-3 flex items-start gap-2.5 rounded-md border border-brand-200 bg-brand-50 p-3">
                <Warning size={15} className="mt-0.5 shrink-0 text-gray-700" />
                <p className="text-xs text-gray-700">
                  <span className="font-medium text-gray-900">
                    {selectedPermission.entry.name}
                  </span>{' '}
                  is a privileged permission in {selectedPermission.group.name}. It is not part of
                  the ordinary view-and-manage pair.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <Field label="Scope type" required error={errors.scope_type}>
              {(props) => (
                <Select
                  {...props}
                  value={scopeType}
                  onChange={(e) => setScopeType(e.target.value)}
                  placeholder="Choose a scope type"
                  options={scopeTypes.map((s) => ({ value: s, label: humanize(s) }))}
                />
              )}
            </Field>

            {scopeType && (
              <Field
                label="Limited to"
                error={errors.scope_id}
                hint={
                  catalogName
                    ? 'Leave blank to grant every record of this type.'
                    : 'Optional. An identifier, or blank for every record of this type.'
                }
              >
                {(props) =>
                  catalogName ? (
                    <Select
                      {...props}
                      value={scopeId}
                      onChange={(e) => setScopeId(e.target.value)}
                      options={[
                        { value: '', label: 'Every one' },
                        ...(scopeOptions.data ?? []).map((row) => ({
                          value: row.id,
                          label: row.code ? `${row.name} (${row.code})` : row.name,
                        })),
                      ]}
                    />
                  ) : (
                    <Input
                      {...props}
                      value={scopeId}
                      onChange={(e) => setScopeId(e.target.value)}
                      placeholder="Every one"
                    />
                  )
                }
              </Field>
            )}

            <Field
              label="Reason"
              required
              error={errors.reason}
              hint="Kept against the grant. Widening what somebody can see is the change an audit asks about."
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Covering for the head of year this term"
                />
              )}
            </Field>
          </>
        )}

        <Field
          label="Expires"
          error={errors.expires_at}
          hint="Optional. A grant with no expiry lasts until somebody revokes it."
        >
          {(props) => (
            <Input
              {...props}
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
