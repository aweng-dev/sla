import { useCallback, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

/**
 * The list's filters and page, held in the URL.
 *
 * ── Why it is read defensively instead of validated ────────────────────────
 *
 * `/students` is declared in `src/app/router.tsx` without `validateSearch`, so
 * the router neither types nor prunes this route's query string. That is not a
 * problem: TanStack only strips undeclared params when the router is created
 * with `search.strict`, and this one is not — a route without a validator
 * receives the whole parsed search object and passes it through a navigation
 * untouched. So the params survive, and this hook does the narrowing a
 * validator would have done.
 *
 * It has to. The default `parseSearch` runs every value through `JSON.parse`,
 * which quietly turns a search for `2026` into the NUMBER 2026 and a search
 * for `true` into a boolean. Reading them as strings without coercing is how a
 * filtered list crashes on somebody's admission number.
 *
 * ── Why the URL and not component state ────────────────────────────────────
 *
 * A registrar filters to one class and sends the link to a colleague; a
 * reload after a mis-click should not throw the filter away. Both need the
 * state to be in the address bar, and neither is served by `useState`.
 */

export interface StudentListSearch {
  search: string
  status: string
  program: string
  group: string
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

export function readStudentListSearch(raw: unknown): StudentListSearch {
  return {
    search: readText(raw, 'search'),
    status: readText(raw, 'status'),
    program: readText(raw, 'program'),
    group: readText(raw, 'group'),
    page: readPage(raw),
  }
}

/**
 * Only what is set reaches the address bar. A URL carrying `status=&page=1` is
 * noise a person cannot read and cannot trim by hand.
 *
 * Also the shape the record screen is handed, so a student opened from
 * "JSS 1A, page 3" carries that in its own query string and the way back does
 * not depend on history.
 */
export function toStudentListQuery(next: StudentListSearch): Record<string, string> {
  const out: Record<string, string> = {}
  if (next.search) out.search = next.search
  if (next.status) out.status = next.status
  if (next.program) out.program = next.program
  if (next.group) out.group = next.group
  if (next.page > 1) out.page = String(next.page)
  return out
}

export function useStudentListSearch() {
  const raw = useSearch({ strict: false })
  const navigate = useNavigate()

  const search = useMemo<StudentListSearch>(() => readStudentListSearch(raw), [raw])

  /**
   * Any change that is not a page change returns to page one.
   *
   * Narrowing a 40-page list while standing on page 12 lands on an empty page
   * that reads as "no results" — the filter looks broken when it worked.
   */
  const setSearch = useCallback(
    (patch: Partial<StudentListSearch>, options?: { replace?: boolean }) => {
      const next: StudentListSearch = { ...search, ...patch, page: patch.page ?? 1 }
      navigate({
        to: '/students',
        search: toStudentListQuery(next),
        replace: options?.replace ?? false,
      })
    },
    [navigate, search],
  )

  const isFiltered =
    search.search !== '' || search.status !== '' || search.program !== '' || search.group !== ''

  const clear = useCallback(() => {
    navigate({ to: '/students', search: {} })
  }, [navigate])

  return { search, setSearch, clear, isFiltered }
}
