import { command, get, getPage, http, post, put, del } from '@/shared/api/client'
import type { ApiEnvelope, Paginated } from '@/shared/api/envelope'
import type {
  AccessGrantPayload,
  DirectoryUser,
  PermissionGroup,
  Role,
  RolePayload,
  UserAccess,
} from './identity.types'

export const identityKeys = {
  all: ['identity'] as const,
  roles: (params?: unknown) => ['identity', 'roles', params] as const,
  role: (id: string) => ['identity', 'role', id] as const,
  permissions: () => ['identity', 'permissions'] as const,
  users: (params?: unknown) => ['identity', 'users', params] as const,
  user: (id: string) => ['identity', 'user', id] as const,
  access: (id: string) => ['identity', 'access', id] as const,
} as const

/** The catalogue, plus the two things the API attaches to it in `meta`. */
export interface PermissionCatalogue {
  groups: PermissionGroup[]
  /** 234 — the count of individual permissions, not of groups. */
  total: number
  /**
   * Legacy keys the API still accepts, mapped to their canonical form —
   * `grades.view` → `gradebook.view`. Worth surfacing: a role imported from an
   * older export can carry an alias, and a screen that did not know about them
   * would show it as an unrecognised permission.
   */
  aliases: Record<string, string>
}

export const identityApi = {
  /**
   * The permission catalogue.
   *
   * `data` is the groups; the total and the alias map are in `meta`, so this
   * cannot use the plain `get()` helper — it would throw away the half of the
   * response that explains the other half.
   */
  permissions: async (): Promise<PermissionCatalogue> => {
    const response = await http.get<ApiEnvelope<PermissionGroup[]>>('/admin/permissions')
    const meta = response.data.meta as { total?: number; aliases?: Record<string, string> }
    return {
      groups: response.data.data ?? [],
      total: typeof meta.total === 'number' ? meta.total : 0,
      aliases: meta.aliases ?? {},
    }
  },

  roles: (params?: { page?: number; per_page?: number }): Promise<Paginated<Role>> =>
    getPage<Role>('/admin/roles', { params }),

  role: (id: string) => get<Role>(`/admin/roles/${id}`),

  createRole: (payload: RolePayload) => post<Role>('/admin/roles', payload),

  /** `name` is NOT updatable — the API's update request omits it, so a role's
   *  name is fixed once created. Only the description and the permissions move. */
  updateRole: (id: string, payload: Omit<RolePayload, 'name'>) =>
    put<Role>(`/admin/roles/${id}`, payload),

  deleteRole: (id: string) => del(`/admin/roles/${id}`),

  users: (params?: { page?: number; per_page?: number }): Promise<Paginated<DirectoryUser>> =>
    getPage<DirectoryUser>('/admin/users', { params }),

  user: (id: string) => get<DirectoryUser>(`/admin/users/${id}`),

  access: (id: string) => get<UserAccess>(`/admin/users/${id}/access`),

  /** Both answer 204. */
  grant: (userId: string, payload: AccessGrantPayload) =>
    command(`/admin/users/${userId}/access`, payload),

  /**
   * Revoking takes the same body as granting, on DELETE.
   *
   * Axios only sends a body on DELETE when it is passed as `data`, which is
   * why this cannot go through the `del()` helper.
   */
  revoke: async (userId: string, payload: AccessGrantPayload): Promise<void> => {
    await http.delete(`/admin/users/${userId}/access`, { data: payload })
  },
}

/**
 * Which of a role's permissions are not in the catalogue.
 *
 * Almost always empty. When it is not, the role carries a legacy alias or a
 * permission the product has since dropped, and hiding that would make the
 * role's real effect invisible.
 */
export function unknownPermissions(
  permissions: string[],
  catalogue: PermissionCatalogue | undefined,
): string[] {
  if (!catalogue) return []
  const known = new Set<string>()
  for (const group of catalogue.groups) {
    for (const entry of group.permissions) known.add(entry.key)
  }
  return permissions.filter((key) => !known.has(key) && !(key in catalogue.aliases))
}

/** `students.manage` → the group it belongs to, for grouping a flat list. */
export function groupFor(
  key: string,
  catalogue: PermissionCatalogue | undefined,
): PermissionGroup | undefined {
  return catalogue?.groups.find((g) => g.permissions.some((p) => p.key === key))
}
