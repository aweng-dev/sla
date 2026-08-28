import { del, http, post, put } from '@/shared/api/client'
import type { Account } from '@/shared/types/auth.types'

/**
 * The caller's own record: `PUT /auth/account` and the three avatar verbs.
 *
 * None of these addresses carry an id — the API acts on whoever presented the
 * token — so there is nothing here to scope, and nothing a caller could point
 * at somebody else. Correcting a colleague's record is `admin/users`, which is
 * a different screen behind different permissions.
 */

/** Every writable column, as `UpdateOwnAccountRequest` defines them. Each is
 *  `sometimes` server-side, so a partial object is a genuine partial update —
 *  see `ProfileForm` for why only dirty fields are sent. */
export interface AccountUpdate {
  name?: string
  email?: string | null
  phone?: string | null
  preferred_locale?: string | null
  timezone?: string | null
}

/** What the upload will accept before the network is involved. Mirrors
 *  `UploadAvatarRequest`; the server re-checks all of it plus the pixel
 *  dimensions, which cannot be measured from a File without decoding it. */
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024

export const accountApi = {
  update: (payload: AccountUpdate) => put<Account>('/auth/account', payload),

  /**
   * The picture itself, as bytes.
   *
   * The endpoint streams the file and issues no URL — deliberately, so the
   * object key never lands in a `Location` header or a proxy log — which means
   * a bare `<img src>` cannot reach it: it would carry no bearer token and be
   * answered 401. The caller fetches the blob and makes its own object URL.
   *
   * 404 when there is no avatar, which is why `has_avatar` exists: it says
   * whether spending this request is worth it.
   */
  avatar: async (): Promise<Blob> => {
    const response = await http.get<Blob>('/auth/account/avatar', { responseType: 'blob' })
    return response.data
  },

  /**
   * `POST`, not `PUT` — PHP populates `$_FILES` for POST only, so a PUT with a
   * file body arrives empty and fails validation for a reason nobody watching
   * can see.
   *
   * `Content-Type: null` matters as much as the verb. The shared client sets
   * `application/json` as an instance default, and axios's own transform turns
   * FormData into a JSON object when it sees that header — the file would be
   * dropped silently. Nulling it lets the browser write the multipart boundary.
   */
  uploadAvatar: (file: File) => {
    const body = new FormData()
    body.append('avatar', file)
    return post<Account>('/auth/account/avatar', body, {
      headers: { 'Content-Type': null },
    })
  },

  /** Back to initials. Answers the account, not a 204. */
  deleteAvatar: () => del<Account>('/auth/account/avatar'),
}
