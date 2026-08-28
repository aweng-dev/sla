/**
 * The API's response envelope.
 *
 * Every JSON response the API produces passes through one middleware
 * (`StandardizeApiResponse`) that puts this shape on it — successes, domain
 * refusals, validation failures and unexpected 500s alike. There is no second
 * shape to handle, which is the whole point of it existing.
 *
 *     { success, message, data, meta: { request_id, timestamp, pagination? },
 *       errors: [{ code, field, message, retryable, meta }] | null }
 *
 * ── Two things that surprise people ────────────────────────────────────────
 *
 *   1. Field errors live in `errors[]`, NOT in `message`. `message` is one
 *      human sentence for the whole failure; `errors[].field` is what a form
 *      attaches to an input. A 422 carries one entry per offending field.
 *
 *   2. Paginated lists are FLATTENED. Rows arrive as `data` — a bare array —
 *      and the counters move to `meta.pagination`. This is NOT Laravel's
 *      default `data.data` / `data.last_page`; code written against the
 *      framework default silently reads `undefined` here.
 */

export interface ApiFieldError {
  /** A stable machine code — `VALIDATION_ERROR`, `INVALID_CREDENTIALS`,
   *  `TENANT_NOT_RESOLVED`, `AUTHENTICATION_REQUIRED`, `ENDPOINT_NOT_FOUND`… */
  code: string
  /** The input this refusal is about, or null when it is about the request. */
  field: string | null
  message: string
  /** Whether the same request could succeed unchanged. Rate limits and gateway
   *  failures say true; a bad password says false. */
  retryable: boolean
  meta: Record<string, unknown> | null
}

export interface Pagination {
  current_page: number
  per_page: number
  total: number
  last_page: number
  from: number | null
  to: number | null
  has_more: boolean
  next_page_url: string | null
  previous_page_url: string | null
}

export interface ApiMeta {
  request_id: string
  timestamp: string
  pagination?: Pagination
  [key: string]: unknown
}

export interface ApiEnvelope<T> {
  success: boolean
  message: string
  data: T
  meta: ApiMeta
  errors: ApiFieldError[] | null
}

/** A list plus the counters that came beside it, already unwrapped. */
export interface Paginated<T> {
  rows: T[]
  pagination: Pagination
}

/**
 * A refusal from the API, carrying everything a screen needs to react.
 *
 * Thrown by the axios interceptor for every non-2xx, so callers never inspect
 * `error.response.data` themselves and never have to guess whether a failure
 * was enveloped.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: ApiFieldError[]
  readonly requestId: string | null
  readonly retryable: boolean

  constructor(params: {
    status: number
    message: string
    code?: string
    errors?: ApiFieldError[]
    requestId?: string | null
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.status = params.status
    this.errors = params.errors ?? []
    this.code = params.code ?? this.errors[0]?.code ?? 'UNKNOWN_ERROR'
    this.requestId = params.requestId ?? null
    this.retryable = this.errors.some((e) => e.retryable)
  }

  /** Field errors keyed by input name, ready to hand to react-hook-form.
   *  Entries with a null field are dropped — they belong on the form root. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const error of this.errors) {
      if (error.field && !(error.field in out)) {
        out[error.field] = error.message
      }
    }
    return out
  }

  /** The message for the form as a whole: the first error that names no field,
   *  falling back to the envelope's own sentence. */
  rootMessage(): string {
    return this.errors.find((e) => e.field === null)?.message ?? this.message
  }

  get isUnauthenticated(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isValidation(): boolean {
    return this.status === 422
  }

  get isTenantUnresolved(): boolean {
    return this.code === 'TENANT_NOT_RESOLVED'
  }

  /** A 401 raised by a screen the user is already signed in to means the token
   *  died. A 401 on the sign-in screen itself is a bad password, and must NOT
   *  bounce the user back to where they already are — the API gives these two
   *  distinct codes precisely so a client can tell them apart. */
  get isExpiredSession(): boolean {
    return this.status === 401 && this.code === 'AUTHENTICATION_REQUIRED'
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** True when a payload looks like the envelope. Used by the interceptor to
 *  decide whether a failure body can be trusted to carry `errors[]`. */
export function isEnvelope(body: unknown): body is ApiEnvelope<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'data' in body &&
    'meta' in body
  )
}
