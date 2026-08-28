import { command, get, post } from '@/shared/api/client'
import type { AccessContext, AuthenticatedSession, MeResponse } from '@/shared/types/auth.types'
import type { TenantContext } from '@/shared/types/tenant.types'

export interface LoginPayload {
  /** An email address, a student number, an admission number or a staff
   *  number. A family is given a card with a number on it and no address, so
   *  the field is deliberately not typed as an email. */
  login: string
  password: string
  device_name?: string
}

export const authApi = {
  /** `POST /auth/login` answers 201 — a token is a resource that did not exist
   *  a moment ago. The tenant is NOT in this payload: it comes from the host
   *  header, and is an argument to the credential check rather than a claim
   *  the client makes. */
  login: (payload: LoginPayload) =>
    post<AuthenticatedSession>('/auth/login', {
      ...payload,
      device_name: payload.device_name ?? 'web',
    }),

  /** Revokes only the presented token. Signing out on a phone should not sign
   *  anyone out of the staff room. Answers 204. */
  logout: () => command('/auth/logout'),

  /** Identity only. Cheap enough to restore a session with. */
  me: () => get<MeResponse>('/auth/me'),

  /** Everything else, in one round trip: modules, navigation, permissions,
   *  scopes, profiles, institution profile and the current session/period. */
  context: () => get<AccessContext>('/portal/context'),
}

export const tenantApi = {
  /** Public — the sign-in screen has to be branded before anyone signs in. */
  context: () => get<TenantContext>('/context'),
}
