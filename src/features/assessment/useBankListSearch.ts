import { useCallback, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

/**
 * The bank list's filters and page, held in the URL.
 *
 * The same shape and reasoning as `useStudentListSearch` — see the long note
 * there. In short: `/question-bank` is declared without `validateSearch`, so
 * the router passes the parsed search object through untouched, and the
 * default `parseSearch` runs every value through `JSON.parse` — which turns a
 * search for `2026` into a number. Reading each value as a string is what
 * stops a filtered list crashing on a bank code.
 */

export interface BankListSearch {
  search: string
  status: string
  course: string
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

export function readBankListSearch(raw: unknown): BankListSearch {
  return {
    search: readText(raw, 'search'),
    status: readText(raw, 'status'),
    course: readText(raw, 'course'),
    page: readPage(raw),
  }
}

/** Only what is set reaches the address bar, and the same shape is handed to
 *  the bank screen so the way back lands where the reader came from. */
export function toBankListQuery(next: BankListSearch): Record<string, string> {
  const out: Record<string, string> = {}
  if (next.search) out.search = next.search
  if (next.status) out.status = next.status
  if (next.course) out.course = next.course
  if (next.page > 1) out.page = String(next.page)
  return out
}

export function useBankListSearch() {
  const raw = useSearch({ strict: false })
  const navigate = useNavigate()

  const search = useMemo<BankListSearch>(() => readBankListSearch(raw), [raw])

  /** Any change that is not a page change returns to page one — narrowing a
   *  long list while standing on page 8 lands on an empty page that reads as
   *  "no results" when the filter in fact worked. */
  const setSearch = useCallback(
    (patch: Partial<BankListSearch>, options?: { replace?: boolean }) => {
      const next: BankListSearch = { ...search, ...patch, page: patch.page ?? 1 }
      navigate({
        to: '/question-bank',
        search: toBankListQuery(next),
        replace: options?.replace ?? false,
      })
    },
    [navigate, search],
  )

  const isFiltered = search.search !== '' || search.status !== '' || search.course !== ''

  const clear = useCallback(() => {
    navigate({ to: '/question-bank', search: {} })
  }, [navigate])

  return { search, setSearch, clear, isFiltered }
}
