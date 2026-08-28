import { useCallback, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

/**
 * The roster's filters and page, held in the URL.
 *
 * Same shape and reasoning as `useStudentListSearch` — the route carries no
 * `validateSearch`, so the router passes the parsed object through untouched
 * and the default `parseSearch` would turn an employee number like `2026` into
 * a NUMBER. Every value is read as a string for that reason.
 */

export interface StaffListSearch {
  search: string
  status: string
  position: string
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
  const page = Number.parseInt(readText(source, 'page'), 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export function readStaffListSearch(raw: unknown): StaffListSearch {
  return {
    search: readText(raw, 'search'),
    status: readText(raw, 'status'),
    position: readText(raw, 'position'),
    page: readPage(raw),
  }
}

export function toStaffListQuery(next: StaffListSearch): Record<string, string> {
  const out: Record<string, string> = {}
  if (next.search) out.search = next.search
  if (next.status) out.status = next.status
  if (next.position) out.position = next.position
  if (next.page > 1) out.page = String(next.page)
  return out
}

export function useStaffListSearch() {
  const raw = useSearch({ strict: false })
  const navigate = useNavigate()

  const search = useMemo<StaffListSearch>(() => readStaffListSearch(raw), [raw])

  /** Any change that is not a page change returns to page one — narrowing
   *  while standing on page 8 lands on an empty page that reads as "no
   *  results" when the filter in fact worked. */
  const setSearch = useCallback(
    (patch: Partial<StaffListSearch>, options?: { replace?: boolean }) => {
      const next: StaffListSearch = { ...search, ...patch, page: patch.page ?? 1 }
      navigate({ to: '/staff', search: toStaffListQuery(next), replace: options?.replace ?? false })
    },
    [navigate, search],
  )

  const isFiltered = search.search !== '' || search.status !== '' || search.position !== ''

  const clear = useCallback(() => {
    navigate({ to: '/staff', search: {} })
  }, [navigate])

  return { search, setSearch, clear, isFiltered }
}
