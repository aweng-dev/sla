import { createContext, use, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Warning } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { qk } from '@/shared/api/queryKeys'
import { authApi, tenantApi } from '@/features/auth/auth.api'
import { useSessionStore } from '@/features/auth/session.store'
import type {
  AccessContext,
  Account,
  Membership,
  PortalKey,
} from '@/shared/types/auth.types'
import type {
  Branding,
  Features,
  Tenant,
  Terminology,
  TerminologyKey,
} from '@/shared/types/tenant.types'

/**
 * One institution, one signed-in person, and what they may see.
 *
 * ── Why this is a provider and not four hooks ──────────────────────────────
 *
 * Because the four answers are useless apart. A navigation tree without the
 * permission list cannot grey out a button; a permission list without the
 * institution profile cannot decide whether to call a division a term or a
 * semester. The API bundles them into `GET /portal/context` for the same
 * reason, and splitting them here would put the round trips back.
 *
 * ── Why it does NOT own the cache purge ────────────────────────────────────
 *
 * The QueryClient is a module singleton that outlives a sign-out performed by
 * SPA navigation (the 401 path — an explicit sign-out does a full page load),
 * so one person's cached students and invoices would otherwise mount under the
 * next sign-in. That purge is `purgeUserScopedQueries`, called from
 * `auth/session.store` on `signIn`/`signOut`/`expire` — at the session
 * boundary, before the token changes.
 *
 * It cannot live here. This file only learns the identity from `/auth/me`,
 * which resolves AFTER the new person's other queries have been issued, so a
 * purge at that point deletes their answers rather than the last person's. See
 * the note above the identity effect below.
 *
 * ── There is no tenant switcher ────────────────────────────────────────────
 *
 * One institution per user. `GET /auth/me` returns that single membership
 * inline and the client never picks a tenant — the API resolves it from the
 * HOST. If a user ever belongs to two schools, this file is where the selector
 * grows.
 */

export interface TenantContextValue {
  /** Resolved from the host, before anyone signs in. */
  tenant: Tenant
  branding: Branding
  features: Features
  /** Null until signed in. */
  account: Account | null
  membership: Membership | null
  access: AccessContext | null
  /** Which front door this person came through. Decided by the API from their
   *  access profiles, not chosen by the client. */
  portal: PortalKey
  isLoading: boolean
}

const TenantCtx = createContext<TenantContextValue | null>(null)

export function TenantProvider({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status)
  const markAnonymous = useSessionStore((s) => s.markAnonymous)
  const confirm = useSessionStore((s) => s.confirm)

  /* Public, and fetched regardless of session: the sign-in screen has to be
   * branded before anyone signs in. */
  const tenantQuery = useQuery({
    queryKey: qk.tenant.context,
    queryFn: tenantApi.context,
    staleTime: 10 * 60_000,
    retry: 1,
  })

  const enabled = status !== 'anonymous'

  const meQuery = useQuery({
    queryKey: qk.auth.me,
    queryFn: authApi.me,
    enabled,
    staleTime: 5 * 60_000,
  })

  const accessQuery = useQuery({
    queryKey: qk.auth.context,
    queryFn: authApi.context,
    enabled: enabled && meQuery.isSuccess,
    staleTime: 5 * 60_000,
  })

  /* `/auth/me` is what turns a stored token from a claim into a session. Its
   * failure is handled by the client's 401 path; what is left here is the case
   * where it succeeded but the person is not a member of this institution —
   * a real answer, and not an error. */
  useEffect(() => {
    if (!meQuery.isSuccess) return
    if (meQuery.data.membership === null) {
      markAnonymous()
      return
    }
    confirm(meQuery.data.membership, meQuery.data.user.id)
  }, [meQuery.isSuccess, meQuery.data, markAnonymous, confirm])

  /* ── What is left of the purge ────────────────────────────────────────── */
  /*
   * The CACHE purge does not belong here, and used to.
   *
   * This effect can only run once `/auth/me` has resolved for the NEW person —
   * by which time their `/portal/context`, `/portal/my-record` and dashboard
   * queries are already in flight or already landed. A `queryClient.clear()`
   * at that moment threw away the incoming person's own data and left every
   * mounted observer pointing at a query that no longer existed, so nothing
   * refetched: the rail and the screen stayed empty until a document reload.
   * That is precisely the sign-out-then-sign-in-on-one-tab path, which is the
   * only path this effect ever fired on — the tenant half of the identity
   * cannot change without a document load, because the API resolves it from
   * the HOST and there is no switcher.
   *
   * `purgeUserScopedQueries` in `auth/session.store` is the cache purge now.
   * It runs from `signIn`/`signOut`/`expire`, BEFORE the token changes, so the
   * previous person's entries are gone before a single request is made for the
   * next one — earlier than this effect could ever be, and without a window in
   * which the new person's answers can be destroyed.
   *
   * What is still this file's job is the tenant-scoped LOCAL STORAGE, which no
   * session purge touches.
   */
  const identity =
    meQuery.data && tenantQuery.data
      ? `${meQuery.data.user.id}:${tenantQuery.data.tenant.id}`
      : null
  const previousIdentity = useRef<string | null>(null)

  useEffect(() => {
    if (identity === null) return
    if (previousIdentity.current !== null && previousIdentity.current !== identity) {
      clearTenantScopedStorage()
    }
    previousIdentity.current = identity
  }, [identity])

  const value = useMemo<TenantContextValue | null>(() => {
    if (!tenantQuery.data) return null

    return {
      tenant: tenantQuery.data.tenant,
      branding: tenantQuery.data.branding,
      features: tenantQuery.data.features,
      account: meQuery.data?.user ?? null,
      membership: meQuery.data?.membership ?? null,
      access: accessQuery.data ?? null,
      portal: accessQuery.data?.navigation.portal ?? 'student',
      isLoading: tenantQuery.isLoading || (enabled && (meQuery.isLoading || accessQuery.isLoading)),
    }
  }, [
    tenantQuery.data,
    tenantQuery.isLoading,
    meQuery.data,
    meQuery.isLoading,
    accessQuery.data,
    accessQuery.isLoading,
    enabled,
  ])

  if (tenantQuery.isLoading) {
    return <TenantBootSplash />
  }

  if (tenantQuery.isError || value === null) {
    return <TenantUnresolved />
  }

  return <TenantCtx value={value}>{children}</TenantCtx>
}

/**
 * Anything persisted per school must be namespaced by tenant id AND listed
 * here, so the purge can find it. A key added to localStorage and not added to
 * this list survives into the next institution's session.
 */
export const TENANT_SCOPED_STORAGE_KEYS = ['schoollink.activePeriod', 'schoollink.tableDensity']

function clearTenantScopedStorage(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (TENANT_SCOPED_STORAGE_KEYS.some((prefix) => key.startsWith(prefix))) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    /* storage disabled; nothing to purge */
  }
}

export function useTenant(): TenantContextValue {
  const value = use(TenantCtx)
  if (value === null) {
    throw new Error('useTenant must be used inside <TenantProvider>')
  }
  return value
}

/**
 * The institution's own word for a concept.
 *
 * A school's `group` is a "Class"; a university's is a "Cohort". Every label
 * that names a domain concept goes through this, so one build serves all three
 * institution vocabularies.
 *
 *     const t = useTerminology()
 *     <h1>{t('learners')}</h1>   // "Students" here, "Trainees" elsewhere
 */
export function useTerminology(): (key: TerminologyKey, fallback?: string) => string {
  const { tenant } = useTenant()
  return useMemo(() => {
    const map = tenant.terminology as Terminology | undefined
    return (key: TerminologyKey, fallback?: string) => map?.[key] ?? fallback ?? String(key)
  }, [tenant.terminology])
}

/**
 * Whether to OFFER something.
 *
 * Not authorization — every route behind every screen re-runs its own check
 * server-side. This decides whether to draw the button, and a button that is
 * drawn and then refused is a worse experience than one that was never there.
 */
export function usePermissions() {
  const { access } = useTenant()

  return useMemo(() => {
    const held = new Set(access?.permissions ?? [])
    return {
      has: (permission: string) => held.has(permission),
      hasAny: (...permissions: string[]) => permissions.some((p) => held.has(p)),
      hasAll: (...permissions: string[]) => permissions.every((p) => held.has(p)),
      all: held,
    }
  }, [access?.permissions])
}

/** Whether a module is switched on for this institution AND held by this
 *  person. The navigation tree already filters on this; the hook is for the
 *  places that are not navigation — an empty state offering a cross-link. */
export function useModules() {
  const { access, features } = useTenant()

  return useMemo(() => {
    const enabled = new Set((access?.modules ?? []).filter((m) => m.enabled).map((m) => m.id))
    return {
      has: (moduleId: string) => enabled.has(moduleId),
      feature: (flag: string) => features[flag] === true,
      all: enabled,
    }
  }, [access?.modules, features])
}

function TenantBootSplash() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-sl-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-accent-500" />
        <p className="text-xs text-gray-600">Loading your institution…</p>
      </div>
    </div>
  )
}

/**
 * The tenant did not resolve.
 *
 * Almost always a configuration problem rather than a user one: the SPA is
 * being served on a hostname no institution is registered at, or `VITE_TENANT_DOMAIN`
 * is unset on localhost, where the browser's own hostname belongs to nobody.
 * Says so, because "something went wrong" sends the reader nowhere.
 */
function TenantUnresolved() {
  const host = window.location.hostname
  const override = import.meta.env.VITE_TENANT_DOMAIN as string | undefined

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-sl-bg px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <Warning size={20} />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">No institution at this address</h1>
        <p className="mt-2 text-sm text-gray-600">
          The API could not match{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-900">
            {override || host}
          </code>{' '}
          to a registered institution.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          On localhost the browser&rsquo;s hostname belongs to no institution, so{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5">VITE_TENANT_DOMAIN</code> must name one.
        </p>
      </div>
    </div>
  )
}
