import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import {
  ApiError,
  isEnvelope,
  type ApiEnvelope,
  type ApiFieldError,
  type Paginated,
  type Pagination,
} from './envelope'

/**
 * The one HTTP client.
 *
 * ── Why the tenant is a HEADER and not part of the token ───────────────────
 *
 * The API resolves the institution from the HOST — `X-Tenant-Domain`, falling
 * back to the request's own hostname — never from the bearer token. In
 * production one SPA build is served on every tenant hostname
 * (`*.schoollink.ng`) while the API answers on a single `api.schoollink.ng`,
 * so the API only ever sees its own host, which belongs to no institution.
 * Without this header EVERY call fails tenant resolution, sign-in included.
 *
 * On localhost the browser's hostname likewise belongs to nobody, so
 * `VITE_TENANT_DOMAIN` overrides it there. In production the override is left
 * unset and the real hostname is the right answer.
 *
 * ── Why there are no cookies ───────────────────────────────────────────────
 *
 * The API sets `allowed_origins: ['*']` with `supports_credentials: false` —
 * it cannot enumerate tenant origins because tenants add custom domains at
 * runtime. That combination is only safe because the credential is a bearer
 * token this client attaches deliberately, with no ambient cookie for a
 * hostile origin to ride on. Do not add `withCredentials`.
 */

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/rest/v1'

/** Where the session token lives between reloads. Not tenant-namespaced: one
 *  browser profile signs into one institution at a time, and the sign-in that
 *  replaces it overwrites this. */
const TOKEN_KEY = 'schoollink.token'

export function resolveTenantDomain(): string {
  const override = import.meta.env.VITE_TENANT_DOMAIN as string | undefined
  if (override && override.trim() !== '') {
    return override.trim()
  }
  return window.location.hostname
}

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    // Private mode, or storage disabled. An in-memory session still works for
    // this tab; it simply will not survive a reload.
    return null
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token === null) {
      window.localStorage.removeItem(TOKEN_KEY)
    } else {
      window.localStorage.setItem(TOKEN_KEY, token)
    }
  } catch {
    /* see readToken */
  }
}

/**
 * Called when the API says the session is gone.
 *
 * Registered by the auth layer rather than imported from it, because this
 * module is the bottom of the dependency graph and must not reach upward into
 * a store. See `features/auth/session.store.ts`.
 */
type UnauthorizedHandler = (error: ApiError) => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
  config.headers.set('X-Tenant-Domain', resolveTenantDomain())

  const token = readToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }

  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const apiError = toApiError(error)

    /*
     * Only an EXPIRED session tears down the app. A 401 on the sign-in screen
     * is `INVALID_CREDENTIALS` and must stay on the form — bouncing the user
     * to sign-in from sign-in is an invisible no-op that reads as "nothing
     * happened when I pressed the button".
     */
    if (apiError.isExpiredSession && onUnauthorized) {
      onUnauthorized(apiError)
    }

    return Promise.reject(apiError)
  },
)

function toApiError(error: AxiosError): ApiError {
  if (error.response) {
    const body = error.response.data

    if (isEnvelope(body)) {
      return new ApiError({
        status: error.response.status,
        message: body.message,
        errors: (body.errors ?? []) as ApiFieldError[],
        requestId: (body.meta?.request_id as string | undefined) ?? null,
      })
    }

    return new ApiError({
      status: error.response.status,
      message: error.response.statusText || 'The request could not be completed.',
      code: 'UNEXPECTED_RESPONSE',
    })
  }

  if (error.code === 'ECONNABORTED') {
    return new ApiError({
      status: 0,
      message: 'The request timed out. Check your connection and try again.',
      code: 'TIMEOUT',
    })
  }

  return new ApiError({
    status: 0,
    message: 'Could not reach the server. Check your connection and try again.',
    code: 'NETWORK_ERROR',
  })
}

/* ────────────────────────────────────────────────────────────────────────────
 * The four verbs, already unwrapped.
 *
 * Callers get `data` and never touch the envelope. `getPage` is separate
 * because a list caller needs the counters too, and they are not in `data` —
 * they are in `meta.pagination`.
 * ──────────────────────────────────────────────────────────────────────────*/

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.get<ApiEnvelope<T>>(url, config)
  return response.data.data
}

export async function getPage<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<Paginated<T>> {
  const response = await http.get<ApiEnvelope<T[]>>(url, config)
  return {
    rows: response.data.data ?? [],
    pagination: response.data.meta.pagination ?? emptyPagination(response.data.data?.length ?? 0),
  }
}

export async function post<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await http.post<ApiEnvelope<T>>(url, body, config)
  return response.data.data
}

export async function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.put<ApiEnvelope<T>>(url, body, config)
  return response.data.data
}

export async function patch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await http.patch<ApiEnvelope<T>>(url, body, config)
  return response.data.data
}

/** 204s carry no body at all — `StandardizeApiResponse` skips them because a
 *  204 is defined as bodiless — so this must not try to read `data.data`. */
export async function del<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response: AxiosResponse<ApiEnvelope<T> | ''> = await http.delete(url, config)
  if (response.status === 204 || response.data === '' || !isEnvelope(response.data)) {
    return undefined as T
  }
  return response.data.data
}

/** POST that expects no body back — sign-out, mark-as-read, publish. */
export async function command(url: string, body?: unknown): Promise<void> {
  await http.post(url, body)
}

function emptyPagination(count: number): Pagination {
  return {
    current_page: 1,
    per_page: count,
    total: count,
    last_page: 1,
    from: count === 0 ? null : 1,
    to: count === 0 ? null : count,
    has_more: false,
    next_page_url: null,
    previous_page_url: null,
  }
}

/**
 * `per_page` is clamped server-side by `PerPage::resolve` — default 25, max
 * 100, absolute ceiling 200. Asking for 1000 silently returns 100, which reads
 * as a short roll rather than an error, so the clamp is applied here too and
 * the caller sees the number it will actually get.
 */
export const PER_PAGE_DEFAULT = 25
export const PER_PAGE_MAX = 100

export function clampPerPage(requested?: number): number {
  if (!requested || Number.isNaN(requested)) return PER_PAGE_DEFAULT
  return Math.min(Math.max(1, Math.trunc(requested)), PER_PAGE_MAX)
}
