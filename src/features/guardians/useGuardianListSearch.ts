import { useCallback, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

/**
 * The list's filters and page, held in the URL.
 *
 * The same shape and the same reasoning as `useStudentListSearch`, with one
 * fewer axis: guardians filter by search and status only. `student_id` is a
 * real API filter but has no picker here — there is no student catalogue
 * endpoint to populate one from — so it is reached the other way round, from a
 * child's record.
 *
 * ── Why it is read defensively instead of validated ────────────────────────
 *
 * `/guardians` is declared in `src/app/router.tsx` without `validateSearch`, so
 * the router neither types nor prunes this route's query string. A route
 * without a validator receives the whole parsed search object and passes it
 * through a navigation untouched, so the params survive and this hook does the
 * narrowing a validator would have done.
 *
 * It has to. The default `parseSearch` runs every value through `JSON.parse`,
 * which quietly turns a search for `2026` into the NUMBER 2026 and a search
 * for `true` into a boolean. Reading them as strings without coercing is how a
 * filtered list crashes on somebody's phone number.
 */

export interface GuardianListSearch {
  search: string
  status: string
  page: number
}

function readText(source: unknown, key: string): string {
  if (typeof source !== 'object' || source === null) return ''
  const value = (source as Record<string, unknown>)[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function readPage(source: unknown): number {
  const raw = readText(source, 'page')
  const page = Number.parseInt(raw, 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export function readGuardianListSearch(raw: unknown): GuardianListSearch {
  return {
    search: readText(raw, 'search'),
    status: readText(raw, 'status'),
    page: readPage(raw),
  }
}

/**
 * Only what is set reaches the address bar. A URL carrying `status=&page=1` is
 * noise a person cannot read and cannot trim by hand.
 *
 * Also the shape the record screen is handed, so a guardian opened from
 * "inactive, page 3" carries that in its own query string and the way back
 * does not depend on history.
 */
export function toGuardianListQuery(next: GuardianListSearch): Record<string, string> {
  const out: Record<string, string> = {}
  if (next.search) out.search = next.search
  if (next.status) out.status = next.status
  if (next.page > 1) out.page = String(next.page)
  return out
}

export function useGuardianListSearch() {
  const raw = useSearch({ strict: false })
  const navigate = useNavigate()

  const search = useMemo<GuardianListSearch>(() => readGuardianListSearch(raw), [raw])

  /**
   * Any change that is not a page change returns to page one.
   *
   * Narrowing a long list while standing on page 8 lands on an empty page that
   * reads as "no results" — the filter looks broken when it worked.
   */
  const setSearch = useCallback(
    (patch: Partial<GuardianListSearch>, options?: { replace?: boolean }) => {
      const next: GuardianListSearch = { ...search, ...patch, page: patch.page ?? 1 }
      navigate({
        to: '/guardians',
        search: toGuardianListQuery(next),
        replace: options?.replace ?? false,
      })
    },
    [navigate, search],
  )

  const isFiltered = search.search !== '' || search.status !== ''

  const clear = useCallback(() => {
    navigate({ to: '/guardians', search: {} })
  }, [navigate])

  return { search, setSearch, clear, isFiltered }
}
