import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { Button, Field, Input, Modal, Skeleton, Textarea } from '@/shared/ui'
import { identityApi, identityKeys } from './identity.api'
import { PermissionPicker } from './PermissionPicker'
import type { Role } from './identity.types'

/** Creating a role: a name, a description, and at least one permission. */
export function NewRoleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const catalogue = useQuery({
    queryKey: identityKeys.permissions(),
    queryFn: identityApi.permissions,
    staleTime: Infinity,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setSelected(new Set())
    setErrors({})
  }, [open])

  const create = useMutation({
    mutationFn: () =>
      identityApi.createRole({
        name: name.trim(),
        description: description.trim() || null,
        permissions: [...selected],
      }),
    onSuccess: (role) => {
      queryClient.invalidateQueries({ queryKey: identityKeys.all })
      toast.success(`“${role.name}” created`)
      onClose()
      navigate({ to: '/rbac/$roleId', params: { roleId: role.id } })
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        /* `permissions.4` names one offending entry; collapse them onto the
         * picker rather than dropping them. */
        const merged: Record<string, string> = {}
        for (const [field, message] of Object.entries(fields)) {
          merged[field.startsWith('permissions') ? 'permissions' : field] = message
        }
        setErrors(merged)
        if (Object.keys(merged).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The role could not be created.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New role"
      description="A bundle of permissions you can give to people."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!name.trim() || selected.size === 0}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Create role
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field
          label="Name"
          required
          error={errors.name}
          hint="Unique within this institution. It cannot be changed later."
        >
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Head of year"
              autoFocus
            />
          )}
        </Field>

        <Field label="Description" error={errors.description}>
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for, and who should hold it."
            />
          )}
        </Field>

        <div className="mt-2 border-t border-gray-200 pt-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Permissions</h3>
          <p className="mb-3 text-xs text-gray-600">
            At least one. Everyone holding this role gets all of them.
          </p>
          {errors.permissions && (
            <p role="alert" className="mb-2 text-xs text-danger-500">
              {errors.permissions}
            </p>
          )}
          {catalogue.isLoading || !catalogue.data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <PermissionPicker
              catalogue={catalogue.data}
              selected={selected}
              onChange={setSelected}
              disabled={create.isPending}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}

/** Deleting a role. The API refuses if it is a system role. */
export function DeleteRoleDialog({
  role,
  open,
  onClose,
}: {
  role: Role
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const remove = useMutation({
    mutationFn: () => identityApi.deleteRole(role.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: identityKeys.all })
      toast.success('Role deleted')
      onClose()
      navigate({ to: '/rbac' })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Could not delete it.'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Delete “${role.name}”?`}
      description="Anyone holding it loses the permissions it carried, unless another role or a direct grant gives them the same."
      footer={
        <>
          <Button onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete role
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-700">
        This cannot be undone. The {role.permissions.length} permissions it grants are not deleted —
        only this bundle of them.
      </p>
    </Modal>
  )
}
