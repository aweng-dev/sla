import { del, get, getPage, post, put, PER_PAGE_MAX } from '@/shared/api/client'
import type { AcademicPeriod, AcademicSession, FeatureSwitch, Institution } from './settings.types'

/**
 * What an institution may change about itself.
 *
 * There is no `/admin/settings` — the probe returns `ENDPOINT_NOT_FOUND` — and
 * settings are not one resource. The record lives at `/admin/institution`, the
 * subscription switches at `/admin/features`, and the academic year at
 * `/admin/academic-sessions`. This module gathers them; the API deliberately
 * does not, because folding four lifecycles into one PUT makes an endpoint that
 * half-succeeds.
 *
 * None of these addresses carry a tenant id. The institution is whichever one
 * the caller reached the API through, so there is nothing here to tamper with.
 */

/** Every writable column, as `UpdateInstitutionRequest` defines them. The type,
 *  the slug and the status are absent on purpose and are not merely
 *  unvalidated — the Action behind the endpoint intersects against its own
 *  list, so sending them changes nothing at all. */
export interface InstitutionUpdate {
  name?: string
  legal_name?: string | null
  default_timezone?: string
  default_locale?: string
  default_currency?: string
  country_code?: string | null
}

/** Mirrors `UploadInstitutionLogoRequest`. Stricter than the avatar's ceiling
 *  because this file is served to visitors before they sign in. */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const LOGO_MAX_BYTES = 4 * 1024 * 1024

export const settingsApi = {
  institution: () => get<Institution>('/admin/institution'),

  updateInstitution: (payload: InstitutionUpdate) => put<Institution>('/admin/institution', payload),

  /** POST, and `Content-Type: null` — the same two reasons as the avatar: PHP
   *  fills `$_FILES` on POST only, and axios turns FormData into JSON when the
   *  client's default `application/json` header is left in place. */
  uploadLogo: (file: File) => {
    const body = new FormData()
    body.append('logo', file)
    return post<Institution>('/admin/institution/logo', body, {
      headers: { 'Content-Type': null },
    })
  },

  /** Answers the institution rather than a 204, so the caller knows whether a
   *  platform default is now in play. */
  deleteLogo: () => del<Institution>('/admin/institution/logo'),

  features: () => get<FeatureSwitch[]>('/admin/features'),

  /** An institution has a handful of years, not pages of them, so this asks for
   *  the ceiling once rather than paginating a list nobody scrolls. */
  sessions: () =>
    getPage<AcademicSession>('/admin/academic-sessions', {
      params: { per_page: PER_PAGE_MAX },
    }),

  periods: (academicSessionId: string) =>
    getPage<AcademicPeriod>('/admin/academic-periods', {
      params: { academic_session_id: academicSessionId, per_page: PER_PAGE_MAX },
    }),

  /**
   * The most consequential write on this screen: every default in the product
   * resolves through the current flag. Its own address rather than a status
   * field, so a screen cannot archive a live year by mistyping a string.
   */
  makeSessionCurrent: (id: string) =>
    post<AcademicSession>(`/admin/academic-sessions/${id}/make-current`),

  makePeriodCurrent: (id: string) =>
    post<AcademicPeriod>(`/admin/academic-periods/${id}/make-current`),
}
